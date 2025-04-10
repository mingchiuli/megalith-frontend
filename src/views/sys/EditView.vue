<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref, useTemplateRef, watch } from 'vue'
import {
  type TagProps,
  type UploadFile,
  type UploadProps,
  type UploadRawFile,
  type UploadRequestOptions,
  type FormRules,
  type FormInstance,
  ElInput,
  type UploadUserFile
} from 'element-plus'
import { GET, POST, UPLOAD } from '@/http/http'
import {
  type EditForm,
  type SensitiveItem,
  type SensitiveTrans,
  Status,
  ButtonAuth,
  SensitiveType,
  type SensitiveExhibit,
  Colors,
  type BlogEdit,
  type SensitiveContentItem
} from '@/type/entity'
import { useRoute } from 'vue-router'
import router from '@/router'
import { blogsStore, syncStore } from '@/stores/store'
import { checkButtonAuth, getButtonType, getButtonTitle } from '@/utils/tools'

import type { UserInfo } from '@/type/entity'

// 编辑器相关导入
import { MdEditor, type Footers, type ToolbarNames, type ExposeParam } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { config } from 'md-editor-v3'
import * as Y from 'yjs'
import * as random from 'lib0/random'
import { yCollab } from 'y-codemirror.next'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

// 导入扩展
import '@vavt/v3-extension/lib/asset/ExportPDF.css'
import { Emoji, ExportPDF } from '@vavt/v3-extension'
import '@vavt/v3-extension/lib/asset/Emoji.css'
import { nextTick } from 'vue'

const initialized = ref(false)
const route = useRoute()
const blogId = route.query.id as string | undefined

// 编辑器引用
const editorRef = useTemplateRef<ExposeParam>('editor')

// 设置同步房间ID
const setupSyncRoom = () => {
  if (blogId) {
    syncStore().room = `blog:${blogId}`
    return `blog:${blogId}`
  } else {
    const userStr = localStorage.getItem('userinfo')!
    const user: UserInfo = JSON.parse(userStr)
    const roomId = `draft:${user.id}`
    syncStore().room = roomId
    return roomId
  }
}
const roomId = setupSyncRoom()

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

const ydoc = new Y.Doc()
const configStore = syncStore()

const wsUrlWithToken = configStore.url
const wsProvider = new WebsocketProvider(wsUrlWithToken.toString(), roomId, ydoc, {
  params: {
    token: configStore.token
  }
})

// 添加连接状态监控
wsProvider.on('status', (event) => {
  console.log('连接状态:', event.status)
  if (event.status === 'disconnected') {
    setTimeout(() => wsProvider.connect(), 1000)
  }
})

const ytext = ydoc.getText('codemirror')
const undoManager = new Y.UndoManager(ytext)
const userColor = usercolors[random.uint32() % usercolors.length]

wsProvider.awareness.setLocalStateField('user', {
  name: 'Anonymous ' + Math.floor(Math.random() * 100),
  color: userColor.color,
  colorLight: userColor.light
})

const indexeddbProvider = new IndexeddbPersistence(roomId, ydoc)

// 配置编辑器扩展
const updateEditorConfig = () => {
  config({
    codeMirrorExtensions(_theme, extensions) {
      return [...extensions, yCollab(ytext, wsProvider.awareness, { undoManager })]
    }
  })
}

// 在初始化和组件更新时更新配置
updateEditorConfig()

const initializeEditor = async () => {
  try {
    await loadEditContent(form, blogId)
    // 等待IndexedDB同步完成
    await indexeddbProvider.whenSynced

    // 首先尝试WebSocket数据
    const wsText = ytext.toString()
    if (wsText) {
      console.log('使用WebSocket同步的内容:', wsText)
      form.content = wsText
      initialized.value = true
      return
    }

    // 最后使用服务器数据或默认数据
    if (form.content) {
      console.log('使用服务器数据:', form.content)
      // 确保清空现有内容后再插入
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, form.content!)
      })
    } else {
      // 默认值
      form.content = ''
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, '')
      })
    }

    initialized.value = true
  } catch (error) {
    console.error('初始化过程出错:', error)
    initialized.value = true
  }
}

onMounted(async () => {
  updateEditorConfig()
  await initializeEditor()
  await nextTick()

  // 设置编辑器敏感内容选择功能

  const editor = document.getElementById('md-editor')
  if (editor) {
    editor.onmouseup = handleEditorMouseUp
  }
})

onUnmounted(async () => {
  if (indexeddbProvider) {
    await indexeddbProvider.clearData()
    await indexeddbProvider.destroy()
  }
  wsProvider.disconnect()
  wsProvider.destroy()
})

// 表单数据
const form = reactive<EditForm>({
  id: undefined,
  userId: undefined,
  title: undefined,
  description: undefined,
  content: undefined,
  status: undefined,
  link: undefined,
  sensitiveContentList: []
})

// 敏感内容相关
type SensitiveTagsItem = {
  element: SensitiveExhibit
  type: TagProps['type']
}

const sensitiveTags = computed(() => {
  const arr: SensitiveTagsItem[] = []
  form.sensitiveContentList.forEach((item) => {
    const str = getExhibitWords(item.type, form)
    const element: SensitiveExhibit = {
      content: str.substring(item.startIndex, item.endIndex),
      startIndex: item.startIndex,
      type: item.type
    }
    const type = getSensitiveType(item.type)
    arr.push({ element: element, type: type })
  })
  return arr
})

const fileList = computed(() => {
  const arr: UploadUserFile[] = []
  if (form.link) {
    arr.push({
      name: 'Cover',
      url: form.link
    })
  }
  return arr
})

const titleRef = useTemplateRef<InstanceType<typeof ElInput>>('title')
const descRef = useTemplateRef<InstanceType<typeof ElInput>>('desc')

// 上传相关
const uploadPercentage = ref(0)
const showPercentage = ref(false)

const dialogVisible = ref(false)
const dialogImageUrl = ref('')

// 表单验证
const formRef = useTemplateRef<FormInstance>('form')
const formRules = reactive<FormRules<EditForm>>({
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  description: [{ required: true, message: '请输入描述', trigger: 'blur' }],
  content: [{ required: true, message: '请输入内容', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'blur' }]
})

// 编辑器工具栏和底部配置
const toolbars: ToolbarNames[] = [
  'revoke',
  'next',
  'bold',
  1,
  'underline',
  'italic',
  '-',
  'title',
  'strikeThrough',
  'sub',
  'sup',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  '-',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'mermaid',
  'katex',
  '-',
  0,
  'pageFullscreen',
  'fullscreen',
  'preview',
  'htmlPreview',
  'catalog',
  'github'
]
const footers: Footers[] = ['markdownTotal', 0, '=', 1, 'scrollSwitch']

// 敏感内容选择对话框
const showSensitiveListDialog = ref(false)
const selectSensitiveData = ref<SensitiveContentItem[]>([])

// 敏感内容选择相关函数
const handleEditorMouseUp = () => {
  if (form.status !== Status.SENSITIVE_FILTER) {
    return
  }

  const selection = editorRef.value?.getSelectedText()

  if (!selection || !form.content) {
    return
  }
  const items = findAllOccurrences(form.content, selection)
  if (items) {
    selectSensitiveData.value = items
    showSensitiveListDialog.value = true
  }
}

const selectWord = (row: SensitiveContentItem) => {
  const sensitive: SensitiveTrans = {
    startIndex: row.startIndex,
    endIndex: row.endIndex,
    type: SensitiveType.CONTENT
  }
  dealSensitive(sensitive)
  selectSensitiveData.value = []
  showSensitiveListDialog.value = false
}

const handleSensitiveDialogClose = () => {
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
    const behindIdx = Math.min(form.content!.length, idx + match[0].length + 5)

    occurrences.push({
      startIndex: idx,
      endIndex: idx + match[0].length,
      content: match[0],
      startContent: form.content!.substring(frontIdx, idx),
      endContent: form.content!.substring(idx + match[0].length, behindIdx)
    })
  }

  if (occurrences.length === 1) {
    selectWord(occurrences[0])
    return
  }

  return occurrences
}

// 上传相关函数
const upload = async (image: UploadRequestOptions) => {
  await uploadFile(image.file)
}

const uploadFile = async (file: UploadRawFile) => {
  const formdata = new FormData()
  formdata.append('image', file)
  const url = await UPLOAD('sys/blog/oss/upload', formdata, uploadPercentage, showPercentage)
  form.link = url
}

const onUploadImg = async (files: File[], callback: Function) => {
  const formdata = new FormData()
  formdata.append('image', files[0])
  const url = await UPLOAD('sys/blog/oss/upload', formdata, uploadPercentage, showPercentage)
  callback([url])
}

const handleRemove = async (_file: UploadFile) => {
  if (!form.link) return
  await GET<null>(`/sys/blog/oss/delete?url=${form.link}`)
  form.link = ''
}

// 表单提交
const submitForm = async (ref: FormInstance) => {
  await ref.validate(async (valid, _fields) => {
    if (valid) {
      await POST<null>('/sys/blog/save', form)
      ElNotification({
        title: '操作成功',
        message: '编辑成功',
        type: 'success',
        duration: 1000
      })
      await indexeddbProvider.clearData()
      blogsStore().pageNum = 1
      router.push({
        name: 'system-blogs'
      })
    }
  })
}

// 图片预览
const handlePictureCardPreview = (file: UploadFile) => {
  dialogImageUrl.value = file.url!
  dialogVisible.value = true
}

// 敏感标签处理
const handleTagClose = (tag: SensitiveTagsItem) => {
  const sensitiveItem = tag.element
  form.sensitiveContentList = form.sensitiveContentList.filter(
    (item) =>
      item.type !== sensitiveItem.type ||
      (item.startIndex !== sensitiveItem.startIndex && item.type === sensitiveItem.type)
  )
}

const dealSensitive = (payload: SensitiveTrans) => {
  let flag = true
  form.sensitiveContentList.forEach((item) => {
    if (
      (item.endIndex === payload.endIndex || item.startIndex === payload.startIndex) &&
      item.type === payload.type
    ) {
      flag = false
    }
  })
  if (flag) {
    const element: SensitiveItem = {
      endIndex: payload.endIndex,
      startIndex: payload.startIndex,
      type: payload.type
    }
    form.sensitiveContentList.push(element)
  }
}

const getSensitiveType = (type: SensitiveType) => {
  let typeProp: TagProps['type']
  if (SensitiveType.TITLE === type) {
    typeProp = 'success'
  } else if (SensitiveType.DESCRIPTION === type) {
    typeProp = 'primary'
  } else {
    typeProp = 'warning'
  }
  return typeProp
}

const getExhibitWords = (type: SensitiveType, form: EditForm) => {
  let words: string
  if (SensitiveType.TITLE === type) {
    words = form.title!
  } else if (SensitiveType.DESCRIPTION === type) {
    words = form.description!
  } else {
    words = form.content!
  }
  return words
}

// 文件上传验证
const beforeUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (rawFile.type !== 'image/jpeg' && rawFile.type !== 'image/png') {
    ElMessage.error('Avatar picture must be JPG/PNG format!')
    return false
  } else if (rawFile.size / 1024 / 1024 > 5) {
    ElMessage.error('Avatar picture size can not exceed 5MB!')
    return false
  }
  return true
}

// 标题和描述处理
const handleTitleSelect = () => {
  if (form.status !== Status.SENSITIVE_FILTER) {
    return
  }

  const title = titleRef.value!.input!
  let start = title.selectionStart!
  let end = title.selectionEnd!

  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }

  const selectedText = form.title?.substring(start, end)
  if (selectedText) {
    const sensitive: SensitiveItem = {
      startIndex: start,
      endIndex: end,
      type: SensitiveType.TITLE
    }
    dealSensitive(sensitive)
  }
}

const handleDescSelect = () => {
  if (form.status !== Status.SENSITIVE_FILTER) {
    return
  }
  const desc = descRef.value!.textarea!

  let start = desc.selectionStart!
  let end = desc.selectionEnd!

  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }

  const selectedText = form.description?.substring(start, end)
  if (selectedText) {
    const sensitive: SensitiveItem = {
      startIndex: start,
      endIndex: end,
      type: SensitiveType.DESCRIPTION
    }
    dealSensitive(sensitive)
  }
}

// 加载编辑内容
const loadEditContent = async (form: EditForm, blogId: string | undefined) => {
  let url = '/sys/blog/edit/pull/echo'
  if (blogId) {
    url += `?blogId=${blogId}`
  }
  const data = await GET<BlogEdit>(url)
  form.title = data.title
  form.description = data.description
  form.content = data.content
  form.link = data.link
  form.status = data.status
  form.id = data.id
  form.userId = data.userId
  form.sensitiveContentList = data.sensitiveContentList
}
</script>

<template>
  <div class="father">
    <el-form :model="form" :rules="formRules" ref="form">
      <el-form-item class="title" prop="title">
        <el-input
          ref="title"
          @select="handleTitleSelect"
          v-model="form.title"
          placeholder="标题"
          maxlength="20"
        />
      </el-form-item>

      <el-form-item class="desc" prop="description">
        <el-input
          ref="desc"
          @select="handleDescSelect"
          autosize
          type="textarea"
          v-model="form.description"
          placeholder="摘要"
          maxlength="60"
        />
      </el-form-item>

      <el-form-item class="status" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio :value="Status.NORMAL">公开</el-radio>
          <el-radio :value="Status.BLOCK">隐藏</el-radio>
          <el-radio :value="Status.SENSITIVE_FILTER">打码</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item v-if="form.status === Status.SENSITIVE_FILTER" label="打码">
        <el-popover
          v-for="tag in sensitiveTags"
          :key="`${tag.element.type}-${tag.element.startIndex}`"
          placement="top-start"
          trigger="hover"
          :content="`${tag.element.content}`"
        >
          <template #reference>
            <el-tag closable :type="tag.type" @close="handleTagClose(tag)">
              {{ tag.element.startIndex }}
            </el-tag>
          </template>
        </el-popover>
      </el-form-item>

      <el-form-item class="cover" :label="getButtonTitle(ButtonAuth.SYS_BLOG_UPLOAD)">
        <el-upload
          v-if="checkButtonAuth(ButtonAuth.SYS_BLOG_UPLOAD)"
          v-model:file-list="fileList"
          action="#"
          list-type="picture-card"
          :before-upload="beforeUpload"
          :limit="1"
          :http-request="upload"
          :on-remove="handleRemove"
          :on-preview="handlePictureCardPreview"
        >
          <el-icon>
            <Plus />
          </el-icon>
        </el-upload>

        <el-dialog v-model="dialogVisible">
          <img style="width: 100%" :src="dialogImageUrl" alt="" />
        </el-dialog>
      </el-form-item>

      <el-form-item label="进度" class="progress" v-if="showPercentage">
        <el-progress type="line" :percentage="uploadPercentage" :color="Colors" />
      </el-form-item>

      <!-- 敏感内容选择对话框 -->
      <el-dialog
        v-model="showSensitiveListDialog"
        title="选择一个词汇"
        width="500"
        :before-close="handleSensitiveDialogClose"
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

      <!-- 内容编辑器 - 直接使用MdEditor而不是自定义组件 -->
      <el-form-item class="content" prop="content">
        <MdEditor
          v-if="initialized"
          v-model="form.content"
          :preview="false"
          :toolbars="toolbars"
          :toolbars-exclude="['github']"
          @on-upload-img="onUploadImg"
          :footers="footers"
          ref="editor"
          id="md-editor"
          :key="roomId"
        >
          <template #defToolbars>
            <ExportPDF v-model="form.content" />
            <Emoji />
          </template>
          <template #defFooters>
            <el-progress
              v-if="showPercentage"
              type="line"
              :percentage="uploadPercentage"
              :color="Colors"
              status="success"
            />
          </template>
        </MdEditor>
      </el-form-item>

      <div class="submit-button">
        <el-button
          :type="getButtonType(ButtonAuth.SYS_EDIT_COMMIT)"
          v-if="checkButtonAuth(ButtonAuth.SYS_EDIT_COMMIT)"
          @click="submitForm(formRef!)"
          >{{ getButtonTitle(ButtonAuth.SYS_EDIT_COMMIT) }}</el-button
        >
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.father {
  max-width: 40rem;
  margin: 0 auto;
}

.title {
  margin-top: 5px;
  width: 200px;
}

.desc {
  margin-top: 5px;
  width: 300px;
}

.progress {
  margin-top: 5px;
  width: 300px;
}

.status {
  margin-top: 5px;
  width: 300px;
}

.el-tag {
  margin: 5px;
}

.el-upload__text {
  margin-top: 5px;
  width: 290px;
}

.submit-button {
  margin: 10px auto;
  text-align: center;
}

.content {
  max-width: 40rem;
  margin: 5px auto;
}

.el-progress {
  width: 150px;
}

/* 添加编辑器样式 */
:deep(.md-editor-footer) {
  height: 40px;
}

.trans-radius {
  display: inline-flex;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 5px;
}
</style>
