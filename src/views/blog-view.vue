<script lang="ts" setup>
import { onBeforeUnmount, onErrorCaptured, reactive, ref, nextTick } from 'vue'
import { GET } from '@/http/http'
import type { BlogExhibit } from '@/type/entity'
import catalogue from '@/components/catalogue-item.vue'
import { markdownToHtml } from '@/utils/markdown'
import Clipboard from 'clipboard'
import { useRoute } from 'vue-router'

const clipboard = new Clipboard('.copy-btn')
clipboard.on('success', () => {
  ElMessage.success('复制成功')
})
clipboard.on('error', () => {
  ElMessage.error('复制失败')
})

const route = useRoute()
const token = route.query.token
const blogId = route.params.id
const loading = ref(true)
const showCatalogue = ref(true)
const loadingCatalogue = ref(true)
if (document.body.clientWidth < 900) {
  showCatalogue.value = false
}

const blog = reactive<BlogExhibit>({
  "title": '',
  "description": '',
  "content": '',
  "avatar": '',
  "readCount": 0,
  "nickname": '',
  "created": ''
})

onBeforeUnmount(() => {
  clipboard.destroy()
})

//处理mavon-editor的bug
onErrorCaptured((_err, _instance, info): boolean => {
  if (info === 'beforeUnmount hook') {
    return false
  }
  return true
})

const catalogueRef = ref<InstanceType<typeof catalogue>>();

(async () => {
  let data: BlogExhibit
  if (token) {
    data = await GET<BlogExhibit>(`/public/blog/secret/${blogId}?readToken=${token}`)
  } else {
    data = await GET<BlogExhibit>(`/public/blog/info/${blogId}`)
  }
  blog.title = data.title
  document.title = data.title
  blog.content = '<blockquote> <p>' + data.description + '</p> </blockquote>' + markdownToHtml(data.content)
  blog.avatar = data.avatar
  blog.readCount = data.readCount
  blog.nickname = data.nickname
  blog.created = data.created
  loading.value = false
  await nextTick()
  catalogueRef.value?.render()
})()
</script>

<template>
  <catalogue-item v-if="loadingCatalogue" v-show="showCatalogue" ref="catalogueRef" v-model:loadingCatalogue="loadingCatalogue"></catalogue-item>
  <div class="exhibit-content">
    <div class="exhibit-title">{{ blog.title }}</div>
    <el-avatar class="exhibit-avatar" :src="blog.avatar" />
    <el-text class="exhibit-author" size="large">作者: {{ blog.nickname }}</el-text>
    <el-text class="exhibit-time" size="default">{{ blog.created }}</el-text>
    <el-text class="exhibit-read-count" size="default">阅读数: {{ blog.readCount }}</el-text>
    <el-skeleton animated :loading="loading" :throttle="300">
      <template #template>
        <el-skeleton :rows="15" />
      </template>
      <template #default>
        <mavon-editor class="exhibit-mavon-editor" :boxShadow="false" :editable="false" :subfield="false"
          v-html="blog.content" :toolbarsFlag="false" defaultOpen="preview" previewBackground="#ffffff"
          code-style="androidstudio" />
      </template>
    </el-skeleton>
    <discuss-item />
  </div>
  <my-footer-item />
</template>

<style lang="less">
@import '@/assets/hljs.less';

.exhibit-content {
  max-width: 40rem;
  margin: 0 auto;
  padding: .5rem;
}

.exhibit-title {
  text-align: center;
  font-size: xx-large;
  margin-top: 30px;
  margin-bottom: 20px;
}

.exhibit-mavon-editor {
  padding: 20px;
}

.exhibit-avatar {
  margin: 0 auto;
  display: block;
}

.exhibit-author {
  display: block;
  text-align: center;
}

.exhibit-time {
  display: block;
  margin-left: 10px;
}

.exhibit-read-count {
  display: block;
  margin-left: 10px;
}
</style>