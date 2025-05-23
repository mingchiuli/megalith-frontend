<script lang="ts" setup>
import { GET } from '@/http/http'
import router from '@/router'
import type { BlogDesc, PageAdapter, SearchPage } from '@/type/entity'
import type {
  AutocompleteFetchSuggestions,
  AutocompleteFetchSuggestionsCallback,
  ElAutocomplete
} from 'element-plus'
import { onBeforeUnmount, ref, useTemplateRef } from 'vue'
import { debounce } from '@/utils/tools'
import { ElLoading } from 'element-plus'
import type HotItem from '@/components/HotItem.vue'
import { storeToRefs } from 'pinia'
import { blogsStore } from '@/stores/store'

const emit = defineEmits<{
  transSearchData: [payload: PageAdapter<BlogDesc>]
  refresh: [payload: void]
}>()

const { keywords } = storeToRefs(blogsStore())
const loading = defineModel<boolean>('loading')
const searchDialogVisible = defineModel<boolean>('searchDialogVisible')
const suggestionList = ref<BlogDesc[]>([])
let currentPage = 1
const hotItemRef = useTemplateRef<InstanceType<typeof HotItem>>('hotItem')

const search = async (
  queryString: string,
  currentPage: number,
  allInfo: boolean,
  searchOrder: number | null
): Promise<SearchPage<BlogDesc>> => {
  loading.value = true
  const data = await GET<SearchPage<BlogDesc>>(
    `/search/public/blog?keywords=${queryString}&currentPage=${currentPage}&allInfo=${allInfo}`
  )
  data.additional = searchOrder
  return Promise.resolve(data)
}

let searchOrder = 1
let timeout: NodeJS.Timeout
let suggestionEle: HTMLElement | null = null
let controller: AbortController | null = null
const div = document.createElement('div')
let loadingInstance: ReturnType<typeof ElLoading.service> | null = null

const searchAbstractAsync: AutocompleteFetchSuggestions = (
  queryString: string,
  cb: AutocompleteFetchSuggestionsCallback
) => {
  if (queryString.trim().length) {
    searchOrder++
    search(queryString, currentPage, false, searchOrder).then((page) => {
      if (page.additional !== searchOrder) {
        return
      }
      currentPage = 1
      suggestionList.value = []
      page.content.forEach((blogsDesc: BlogDesc) => {
        blogsDesc.value = keywords.value
        suggestionList.value.push(blogsDesc)
      })

      //防止空内容闪烁
      timeout = setTimeout(() => {
        //不执行cd 下拉框没数据就不会收回去
        cb(suggestionList.value)
        if (!page.content.length) {
          suggestionList.value = []
          ElMessage.error('No Records')
          return
        }

        if (!suggestionEle) {
          suggestionEle = document.querySelector('.select-list .el-autocomplete-suggestion__wrap')
          suggestionEle!.append(div)
          controller = new AbortController()
          const { signal } = controller
          fin = false
          suggestionEle!.addEventListener(
            'scroll',
            debounce(() => load(suggestionEle!, cb)),
            { signal }
          )
        }
      }, 1000 * Math.random())
    })
  }
}

let lock = false
let fin = false
const load = async (e: Element, cb: AutocompleteFetchSuggestionsCallback) => {
  if (!lock && keywords.value && e.scrollTop + e.clientHeight >= e.scrollHeight) {
    if (fin) return
    lock = true
    e.append(div)
    loadingInstance = ElLoading.service({ target: div })
    const page: PageAdapter<BlogDesc> = await search(
      keywords.value,
      currentPage + 1,
      false,
      null
    )
    if (page.content.length < page.pageSize) {
      page.content.forEach((blogsDesc: BlogDesc) => {
        blogsDesc.value = keywords.value
        suggestionList.value.push(blogsDesc)
      })
      cb(suggestionList.value)
      loadingInstance.close()
      controller?.abort()
      if (e.lastChild === div) e.removeChild(div)
      lock = false
      fin = true
      return
    }
    loadingInstance.close()
    e.removeChild(div)
    currentPage++
    page.content.forEach((blogsDesc: BlogDesc) => {
      blogsDesc.value = keywords.value
      suggestionList.value.push(blogsDesc)
    })
    cb(suggestionList.value)
    lock = false
  }
}

const handleSelect = (item: Record<string, string | number>) => {
  router.push({
    name: 'blog',
    params: {
      id: item.id
    }
  })
}

const searchAllInfo = async (queryString: string, currentPage = 1) => {
  searchDialogVisible.value = false
  if (queryString.length) {
    const page: PageAdapter<BlogDesc> = await search(
      queryString,
      currentPage,
      true,
      null
    )
    if (page.content.length) {
      emit('transSearchData', page)
      return
    }
  }
  emit('refresh')
}

const searchBeforeClose = (close: () => void) => {
  keywords.value = ''
  refAutocompleteRef.value!.suggestions = []
  if (controller) controller.abort()
  suggestionEle = null
  suggestionList.value = []
  emit('refresh')
  close()
}

const refAutocompleteRef = useTemplateRef<InstanceType<typeof ElAutocomplete>>('refAutocomplete')

const openDialog = () => {
  hotItemRef.value!.load()
}

const clearSearch = () => {
  searchOrder = 1
  currentPage = 1
  keywords.value = ''
  if (controller) controller.abort()
  suggestionEle = null
}

onBeforeUnmount(() => {
  if (controller) controller.abort()
  clearTimeout(timeout)
})

defineExpose({ searchAllInfo })
</script>

<template>
  <el-dialog
    v-model="searchDialogVisible"
    center
    close-on-press-escape
    fullscreen
    align-center
    :before-close="searchBeforeClose"
    @open="openDialog"
  >
    <template #default>
      <HotItem ref="hotItem" class="dialog-hot" />
      <div class="dialog-autocomplete">
        <el-autocomplete
          id="elc"
          v-model="keywords"
          :fetch-suggestions="searchAbstractAsync"
          placeholder="Please input"
          placement="bottom"
          @select="handleSelect"
          :trigger-on-focus="false"
          popper-class="select-list"
          clearable
          @keyup.enter="searchAllInfo(keywords!)"
          ref="refAutocomplete"
          @clear="clearSearch"
          :fit-input-width="true"
        >
          <template #default="{ item }">
            <template v-if="item.highlight.title">
              <div
                class="value"
                v-for="(title, key) in item.highlight.title"
                v-bind:key="key"
                v-html="'标题：' + title"
              />
            </template>
            <template v-if="item.highlight.description">
              <div
                class="value"
                v-for="(description, key) in item.highlight.description"
                v-bind:key="key"
                v-html="'摘要：' + description"
              />
            </template>
            <template v-if="item.highlight.content">
              <div
                id="scroll"
                class="value"
                v-for="(content, key) in item.highlight.content"
                v-bind:key="key"
                v-html="'内容：' + content"
              />
            </template>
          </template>
          <template #loading>
            <svg class="circular" viewBox="0 0 50 50">
              <circle class="path" cx="25" cy="25" r="20" fill="none" />
            </svg>
          </template>
        </el-autocomplete>
      </div>

    </template>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" @click="searchAllInfo(keywords!)">Confirm</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.value {
  overflow-x: auto;
}
        
.dialog-autocomplete {
  margin: 10px auto 0 auto;
  max-width: max-content;
}

.dialog-hot {
  margin: 0 auto;
}

.circular {
  display: inline;
  height: 30px;
  width: 30px;
  animation: loading-rotate 2s linear infinite;
}

.path {
  animation: loading-dash 1.5s ease-in-out infinite;
  stroke-dasharray: 90, 150;
  stroke-dashoffset: 0;
  stroke-width: 2;
  stroke: var(--el-color-primary);
  stroke-linecap: round;
}
</style>
