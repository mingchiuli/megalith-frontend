<template>
  <div class="about">
    <div v-if="!initialized">正在加载协作内容...</div>
    <MdEditor v-if="initialized" v-model="text" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { onUnmounted } from 'vue'
import { config } from 'md-editor-v3'
import * as Y from 'yjs'
import * as random from 'lib0/random'
import { yCollab } from 'y-codemirror.next'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

const initialized = ref(false)
const text = ref('')
const serverText = ref('123')

const usercolors = [
  { color: '#30bced', light: '#30bced33' },
  { color: '#6eeb83', light: '#6eeb8333' },
  { color: '#ffbc42', light: '#ffbc4233' },
  { color: '#ecd444', light: '#ecd44433' },
  { color: '#ee6352', light: '#ee635233' },
  { color: '#9ac2c9', light: '#9ac2c933' },
  { color: '#8acb88', light: '#8acb8833' },
  { color: '#1be7ff', light: '#1be7ff33' },
]

const url = 'ws://127.0.0.1:8089/rooms'
const room = '11'
const token = '12345'

const ydoc = new Y.Doc()

const wsUrlWithToken = url
const wsProvider = new WebsocketProvider(
  wsUrlWithToken.toString(),
  room,
  ydoc,
  {
    params: {
      token: localStorage.getItem('token')!, // 作为查询参数添加 token
    },
  },
)
const ytext = ydoc.getText('codemirror')
const undoManager = new Y.UndoManager(ytext)
const userColor = usercolors[random.uint32() % usercolors.length]

wsProvider.awareness.setLocalStateField('user', {
  name: 'Anonymous ' + Math.floor(Math.random() * 100),
  color: userColor.color,
  colorLight: userColor.light,
})

const indexeddbProvider: IndexeddbPersistence = new IndexeddbPersistence(
  room,
  ydoc,
)

config({
  codeMirrorExtensions(_theme, extensions) {
    return [...extensions, yCollab(ytext, wsProvider.awareness, { undoManager })]
  },
})

const initializeEditor = async () => {
  try {
    // 等待IndexedDB同步完成
    await indexeddbProvider.whenSynced

    // 1. 首先尝试WebSocket数据 
    const wsText = ytext.toString()
    if (wsText) {
      console.log('使用WebSocket同步的内容:', wsText)
      text.value = wsText
      initialized.value = true
      return
    }

    // 3. 最后使用服务器数据或默认数据
    if (serverText.value) {
      console.log('使用服务器数据:', serverText.value)
      // 确保清空现有内容后再插入
      wsProvider.doc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, serverText.value)
      })
      text.value = serverText.value
    } else {
      // 默认值
      text.value = ''
      wsProvider.doc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, text.value)
      })
    }

    initialized.value = true
  } catch (error) {
    console.error('初始化过程出错:', error)
    initialized.value = true
  }
}

onMounted(async () => {
  await initializeEditor()
})

onUnmounted(async () => {
  if (indexeddbProvider) {
    // await indexeddbProvider.clearData()
    indexeddbProvider.destroy()
  }
  wsProvider.destroy()
})
</script>
