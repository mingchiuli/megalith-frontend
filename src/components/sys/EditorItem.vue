<script lang="ts" setup>
import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

import { UPLOAD } from '@/http/http'
import { onMounted, ref } from 'vue'
import {
  SensitiveType,
  Status,
  type SensitiveTrans,
  type SensitiveContentItem,
  type UserInfo
} from '@/type/entity'

import { Milkdown, useEditor } from '@milkdown/vue'
import { Crepe } from '@milkdown/crepe'
import { Doc } from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { collab, collabServiceCtx } from '@milkdown/plugin-collab'
import * as random from 'lib0/random'
import { useRoute } from 'vue-router'
import { onUnmounted } from 'vue'
import { checkAccessToken } from '@/utils/tools'

const route = useRoute()
const userStr = localStorage.getItem('userinfo')!
const user: UserInfo = JSON.parse(userStr)
const blogId = route.query.id as string | undefined
const roomId = blogId ? `${blogId}` : `init:${user.id}`

const emit = defineEmits<{
  sensitive: [payload: SensitiveTrans]
}>()

const { formStatus } = defineProps<{
  formStatus: number
}>()

const content = defineModel<string>('content')

const uploadPercentage = ref(0)
const showPercentage = ref(false)
const showSensitiveListDialog = ref(false)

const selectSensitiveData = ref<SensitiveContentItem[]>([])

const selectWord = (row: SensitiveContentItem) => {
  const sensitive: SensitiveTrans = {
    startIndex: row.startIndex,
    endIndex: row.endIndex,
    type: SensitiveType.CONTENT
  }
  emit('sensitive', sensitive)
  selectSensitiveData.value = []
  showSensitiveListDialog.value = false
}

const handleClose = () => {
  selectSensitiveData.value = []
  showSensitiveListDialog.value = false
}

const findAllOccurrences = (text: string, pattern: string) => {
  const regex = new RegExp(pattern, 'g')
  let match
  const occurrences: SensitiveContentItem[] = []

  while ((match = regex.exec(text))) {
    const idx = match.index
    const frontIdx = Math.max(0, idx - 5)
    const behindIdx = Math.min(content.value!.length, idx + match[0].length + 5)

    occurrences.push({
      startIndex: idx,
      endIndex: idx + match[0].length,
      content: match[0],
      startContent: content.value!.substring(frontIdx, idx),
      endContent: content.value!.substring(idx + match[0].length, behindIdx)
    })
  }

  if (occurrences.length === 1) {
    selectWord(occurrences[0])
    return
  }

  return occurrences
}

const onUploadImg = async (file: File) => {
  const formdata = new FormData()
  formdata.append('image', file)
  const url = await UPLOAD('sys/blog/oss/upload', formdata, uploadPercentage, showPercentage)
  return url
}

let websocketProvider: WebsocketProvider | undefined
let indexeddbProvider: IndexeddbPersistence | undefined

useEditor((root) => {
  const crepe = new Crepe({
    root,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: async (file: File) => await onUploadImg(file)
      }
    }
  })

  const editor = crepe.editor
  editor.use(collab)

  crepe.on((listener) => {
    listener.markdownUpdated((ctx, text) => {
      content.value = text
    })
  })

  crepe.create().then(() => {
    const doc = new Doc()

    // 首先创建 IndexeddbPersistence
    indexeddbProvider = new IndexeddbPersistence(roomId, doc)

    // 等待 IndexedDB 同步完成
    indexeddbProvider.once('synced', () => {
      websocketProvider = new WebsocketProvider(
        `${import.meta.env.VITE_BASE_WS_URL}/rooms`,
        roomId,
        doc,
        {
          params: {
            token: localStorage.getItem('accessToken')!
          },
          connect: true,
          resyncInterval: 3000,
          maxBackoffTime: 10000
        }
      )

      const usercolors = [
        { color: '#30bced', light: '#30bced33' },
        { color: '#6eeb83', light: '#6eeb8333' },
        { color: '#ffbc42', light: '#ffbc4233' },
        { color: '#ecd444', light: '#ecd44433' },
        { color: '#ee6352', light: '#ee635233' },
        { color: '#9ac2c9', light: '#9ac2c933' },
        { color: '#8acb88', light: '#8acb8833' },
        { color: '#1be7ff', light: '#1be7ff33' }
      ]

      const userColor = usercolors[random.uint32() % usercolors.length]
      websocketProvider.awareness.setLocalStateField('user', {
        name: user.nickname,
        color: userColor.color,
        colorLight: userColor.light
      })

      editor.action((ctx) => {
        const collabService = ctx.get(collabServiceCtx)

        collabService
          // bind doc and awareness
          .bindDoc(doc)
          .setAwareness(websocketProvider!.awareness)

        websocketProvider!.once('sync', async (isSynced: boolean) => {
          if (isSynced) {
            collabService
              // apply your template
              .applyTemplate(content.value!, (remote) => {
                // apply your template logic here
                const b = remote.textContent
                if (b) {
                  content.value = remote.textContent
                }
                return !b
              })
              // don't forget connect
              .connect()
          }
        })
      })
    })
  })
  return crepe
})

const clearLocalData = async () => {
  if (indexeddbProvider) {
    await indexeddbProvider.clearData()
  }
}

onMounted(() => {
  document.getElementById('milk')!.onmouseup = () => {
    if (formStatus !== Status.SENSITIVE_FILTER) {
      return
    }

    const selection = document.getSelection()?.toString()

    if (!selection || !content.value) {
      return
    }
    const items = findAllOccurrences(content.value, selection)
    if (items) {
      selectSensitiveData.value = items
      showSensitiveListDialog.value = true
    }
  }
})

const checkTokenTask = setInterval(async () => {
  await checkAccessToken()
  if (websocketProvider) {
    websocketProvider.params = {
      token: localStorage.getItem('accessToken')!
    }
  }
}, 1000)

onUnmounted(async () => {
  if (websocketProvider) {
    websocketProvider.disconnect()
  }

  if (indexeddbProvider) {
    await indexeddbProvider.destroy()
  }
  if (checkTokenTask) {
    clearInterval(checkTokenTask)
  }
})

defineExpose({
  clearLocalData
})
</script>

<template>
  <el-dialog
    v-model="showSensitiveListDialog"
    title="选择一个词汇"
    width="500"
    :before-close="handleClose"
  >
    <el-table :data="selectSensitiveData" @row-click="selectWord" border stripe>
      <el-table-column property="startIndex" label="开始位置" align="center" width="100" />
      <el-table-column property="endIndex" label="结束位置" align="center" width="100" />
      <el-table-column property="content" label="内容" align="center">
        <template #default="scope">
          <el-text>
            {{ scope.row.startContent }}
            <el-text tag="mark">{{ scope.row.content }}</el-text>
            {{ scope.row.endContent }}
          </el-text>
        </template>
      </el-table-column>
    </el-table>
  </el-dialog>

  <Milkdown id="milk" />
</template>

<style scoped>
/* 编辑器内容区域内边距 */
:deep(.milkdown .ProseMirror) {
  padding: 10px 15px;
}

.el-progress {
  width: 100px;
  display: inline-flex;
}

:deep(.milkdown) {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  width: 640px;
}
</style>
