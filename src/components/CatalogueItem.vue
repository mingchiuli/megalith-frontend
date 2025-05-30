<script lang="ts" setup>
import type { CatalogueLabel } from '@/type/entity'
import type { ElTree } from 'element-plus'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import Node from 'element-plus/es/components/tree/src/model/node'
import { debounce } from '@/utils/tools'

defineProps<{
  width: number
}>()

const loadingCatalogue = defineModel<boolean>('loadingCatalogue')
const loading = ref(true)
const data = ref<CatalogueLabel[]>()
let allNodes: Node[]
const defaultProps = { children: 'children', label: 'label' }
const rollGap = 10
const treeRef = useTemplateRef<InstanceType<typeof ElTree>>('tree')
let labels: NodeListOf<HTMLElement>

const handleNodeClick = (data: CatalogueLabel) =>
  window.scrollTo({ top: data.dist - rollGap, behavior: 'instant' })

const render = async () => {
  labels = document.querySelectorAll<HTMLElement>(
    '#preview-only-preview h1, #preview-only-preview h2, #preview-only-preview h3, #preview-only-preview h4, #preview-only-preview h5, #preview-only-preview h6'
  )
  if (labels.length === 0) {
    loadingCatalogue.value = false
    return
  }

  const arrs = geneCatalogueArr(labels)
  data.value = arrs
  const height = selectAnchorHeight(arrs, location.hash.substring(1))
  window.scrollTo({ top: height + document.documentElement.scrollTop, behavior: 'instant' })
  loading.value = false
  await nextTick()
  allNodes = treeRef.value!.store._getAllNodes()
}

const selectAnchorHeight = (labels: CatalogueLabel[], id: string): number => {
  for (const label of labels) {
    if (label.id === id) {
      return label.dist
    }
    const h = selectAnchorHeight(label.children as CatalogueLabel[], id)
    if (h !== 0) {
      return h
    }
  }
  return 0
}

const geneCatalogueArr = (labels: NodeListOf<HTMLElement>): CatalogueLabel[] => {
  const arr: CatalogueLabel[] = []
  const scrolled = document.documentElement.scrollTop
  for (let i = 0; i < labels.length; i++) {
    const aLabel = labels[i]
    const item: CatalogueLabel = {
      id: '',
      label: '',
      dist: 0,
      children: []
    }

    const id = String(i)
    item.id = id
    //顶端距离
    //防止图片偏移位置不对
    item.dist = aLabel.getBoundingClientRect().top + scrolled
    item.label = aLabel.innerText
    item.children = getChildren(labels, i)
    i += getChildrenTotal(item.children as CatalogueLabel[])
    arr.push(item)
  }
  return arr
}

const getChildrenTotal = (children: CatalogueLabel[]): number => {
  if (!children.length) {
    return 0
  }

  let count = 0
  children.forEach((e) => {
    count++
    count += getChildrenTotal(e.children as CatalogueLabel[])
  })
  return count
}

const getChildren = (labels: NodeListOf<HTMLElement>, index: number): CatalogueLabel[] => {
  const arr: CatalogueLabel[] = []
  if (index === labels.length - 1) {
    return arr
  }

  const curLabel = labels[index].nodeName
  const curLabelNo = curLabel.substring(1)
  const scrolled = document.documentElement.scrollTop
  for (let i = index + 1; i < labels.length; i++) {
    const aLabel = labels[i]
    const labelNo = aLabel.nodeName.substring(1)

    if (parseInt(labelNo) <= parseInt(curLabelNo)) {
      break
    }

    const item: CatalogueLabel = {
      id: '',
      label: '',
      dist: 0,
      children: []
    }

    const id = String(i)
    item.id = id
    item.dist = aLabel.getBoundingClientRect().top + scrolled
    item.label = aLabel.innerText
    item.children = getChildren(labels, i)
    i += getChildrenTotal(item.children as CatalogueLabel[])
    arr.push(item)
  }
  return arr
}

const rollToTargetLabel = (data: CatalogueLabel[], scrolled: number): CatalogueLabel => {
  let label: CatalogueLabel
  for (const element of data) {
    if (scrolled - element.dist < -rollGap - 1) {
      break
    }

    label = element
    const childLabel = rollToTargetLabel(element.children as CatalogueLabel[], scrolled)
    if (childLabel) {
      label = childLabel
    }
  }
  return label!
}

const extractAndFlushData = async () => {
  if (labels.length === 0) {
    return
  }
  const arrs = geneCatalogueArr(labels)
  data.value = arrs
  await nextTick()
  //重新获取，否则获取的对象就不一样
  allNodes = treeRef.value!.store._getAllNodes()
}

const roll = async () => {
  if (!allNodes) {
    return
  }

  const scrolled = document.documentElement.scrollTop
  await extractAndFlushData()
  const temp: CatalogueLabel = rollToTargetLabel(data.value!, scrolled)!
  //高亮和关闭树节点的逻辑
  for (const node of allNodes) {
    const id = node.data.id
    if (temp?.id === id && !node.expanded) {
      node.expanded = true
      treeRef.value?.setCurrentKey(id)
      history.replaceState(history.state, '', `#${id}`)
    }
    if (temp?.id !== id && node.expanded) {
      node.expanded = false
    }
  }
  //处理顶级节点高亮不符合逻辑的问题
  if (!temp) {
    treeRef.value?.setCurrentKey(undefined)
    history.replaceState(history.state, '', ' ')
  }
}

const throttle = debounce(roll)

onMounted(() => {
  window.addEventListener('scroll', throttle)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', throttle)
})

defineExpose({
  render
})
</script>

<template>
  <el-card shadow="never" class="box">
    <el-skeleton animated :loading="loading" :throttle="100">
      <template #template>
        <el-skeleton :rows="2" animated />
      </template>
      <template #default>
        <el-tree
          :data="data"
          :props="defaultProps"
          accordion
          @node-click="handleNodeClick"
          ref="tree"
          node-key="id"
          highlight-current
        />
      </template>
    </el-skeleton>
  </el-card>
</template>

<style scoped>
.box {
  padding: 0px;
  min-height: 100px;
  width: v-bind(width + 'px');
  overflow-y: auto;
  overflow-x: auto;
}

.box:deep(.el-tree-node) {
  overflow: auto;
}

.el-card:deep(.el-card__body) {
  padding: 5px;
}
</style>
