<script lang="ts" setup>
import { GET, POST } from '@/http/http'
import type { MenuSys } from '@/type/entity'
import { type FormInstance, type FormRules } from 'element-plus'
import { reactive, ref, useTemplateRef } from 'vue'
import { Status, RoutesEnum, ButtonAuth } from '@/type/entity'
import { checkButtonAuth, getButtonType, downloadData, getButtonTitle } from '@/utils/tools'
import { displayState } from '@/utils/position'

const { fix } = displayState()
const dialogVisible = ref(false)
const loading = ref(false)
const content = ref<MenuSys[]>([])
const formRef = useTemplateRef<FormInstance>('form')
const uploadPercentage = ref(0)
const showPercentage = ref(false)

const props = {
  label: 'title',
  //这个value代表根据这个值找节点，和v-model="value"的value不是一个概念
  value: 'menuId',
  disabled: (data: MenuSys) => data.status !== 0 || data.type === RoutesEnum.BUTTON
}

type Form = {
  menuId?: number
  parentId: number
  title: string
  name: string
  url: string
  component: string
  type: number
  icon: string
  orderNum: number
  status: number
}

const form: Form = reactive({
  menuId: undefined,
  parentId: 0,
  title: '',
  name: '',
  url: '',
  component: '',
  type: 0,
  icon: '',
  orderNum: 0,
  status: 0
})

const editFormRules = reactive<FormRules<Form>>({
  parentId: [{ required: true, message: '请输入父ID', trigger: 'blur' }],
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'blur' }],
  orderNum: [{ required: true, message: '请输入排序号', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'blur' }]
})

const handleEdit = async (row: MenuSys) => {
  const data = await GET<MenuSys>(`/sys/menu/info/${row.menuId}`)
  form.menuId = data.menuId
  form.parentId = data.parentId
  form.title = data.title
  form.name = data.name
  form.url = data.url
  form.component = data.component
  form.status = data.status
  form.type = data.type
  form.icon = data.icon
  form.orderNum = data.orderNum
  dialogVisible.value = true
}

const handleDelete = async (row: MenuSys) => {
  await POST<null>(`/sys/menu/delete/${row.menuId}`, null)
  ElNotification({
    title: '操作成功',
    message: '删除成功',
    type: 'success'
  })
  await queryMenus()
}

const handleClose = () => {
  clearForm()
  dialogVisible.value = false
}

const download = async () => {
  await downloadData('/sys/menu/download', 'menus', uploadPercentage, showPercentage)
}

const clearForm = () => {
  form.menuId = undefined
  form.parentId = 0
  form.title = ''
  form.name = ''
  form.url = ''
  form.component = ''
  form.type = 0
  form.icon = ''
  form.orderNum = 0
  form.status = 0
}

const queryMenus = async () => {
  loading.value = true
  const data = await GET<Array<MenuSys>>('/sys/menu/list')
  const top = {
    menuId: 0,
    parentId: -1,
    title: '顶级节点',
    name: '',
    url: '',
    component: '',
    type: 0,
    icon: '',
    orderNum: 0,
    status: 0,
    children: data
  } as MenuSys
  content.value = []
  content.value.push(top)
  loading.value = false
}

const submitForm = async (ref: FormInstance) => {
  await ref.validate(async (valid, _fields) => {
    if (valid) {
      await POST<null>('/sys/menu/save', form)
      ElNotification({
        title: '操作成功',
        message: '编辑成功',
        type: 'success'
      })
      clearForm()
      dialogVisible.value = false
      await queryMenus()
    }
  })
}

;(async () => {
  await queryMenus()
})()
</script>

<template>
  <el-form :inline="true" @submit.prevent class="button-form">
    <el-form-item v-if="checkButtonAuth(ButtonAuth.SYS_MENU_CREATE)">
      <el-button
        :type="getButtonType(ButtonAuth.SYS_MENU_CREATE)"
        size="large"
        @click="dialogVisible = true"
        >{{ getButtonTitle(ButtonAuth.SYS_MENU_CREATE) }}</el-button
      >
    </el-form-item>
    <el-form-item v-if="checkButtonAuth(ButtonAuth.SYS_MENU_DOWNLOAD)">
      <el-button
        :type="getButtonType(ButtonAuth.SYS_MENU_DOWNLOAD)"
        size="large"
        @click="download"
        >{{ getButtonTitle(ButtonAuth.SYS_MENU_DOWNLOAD) }}</el-button
      >
    </el-form-item>
    <el-form-item>
      <el-progress v-if="showPercentage" type="circle" :width="40" :percentage="uploadPercentage" />
    </el-form-item>
  </el-form>

  <el-table v-loading="loading" :data="content" row-key="menuId" border stripe default-expand-all>
    <el-table-column prop="title" label="标题" sortable min-width="150" align="center" />
    <el-table-column prop="icon" label="图标" align="center" min-width="150" />

    <el-table-column prop="type" label="类型" align="center">
      <template #default="scope">
        <el-tag size="small" v-if="scope.row.type === RoutesEnum.CATALOGUE">分类</el-tag>
        <el-tag size="small" v-else-if="scope.row.type === RoutesEnum.MENU" type="success"
          >菜单</el-tag
        >
        <el-tag size="small" v-else-if="scope.row.type === RoutesEnum.BUTTON" type="info"
          >按钮</el-tag
        >
      </template>
    </el-table-column>

    <el-table-column prop="url" label="URL" align="center" min-width="180" />
    <el-table-column prop="component" label="组件URI" align="center" min-width="180" />
    <el-table-column prop="name" label="组件名" align="center" min-width="180" />
    <el-table-column prop="orderNum" label="排序" align="center" />

    <el-table-column label="创建时间" min-width="180" align="center">
      <template #default="scope">
        <div class="time-icon">
          <el-icon>
            <timer v-if="scope.row.parentId !== -1" />
          </el-icon>
          <span style="margin-left: 10px">{{ scope.row.created }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column label="更新时间" min-width="180" align="center">
      <template #default="scope">
        <div class="time-icon">
          <el-icon>
            <timer v-if="scope.row.parentId !== -1" />
          </el-icon>
          <span style="margin-left: 10px">{{ scope.row.updated }}</span>
        </div>
      </template>
    </el-table-column>

    <el-table-column prop="status" label="状态" align="center">
      <template #default="scope">
        <el-tag size="small" v-if="scope.row.status === Status.NORMAL" type="success">正常</el-tag>
        <el-tag size="small" v-else-if="scope.row.status === Status.BLOCK" type="danger"
          >禁用</el-tag
        >
      </template>
    </el-table-column>
    <el-table-column :fixed="fix" label="操作" align="center" min-width="180">
      <template #default="scope">
        <template v-if="scope.row.menuId !== 0 && checkButtonAuth(ButtonAuth.SYS_MENU_EDIT)">
          <el-button
            size="small"
            :type="getButtonType(ButtonAuth.SYS_MENU_EDIT)"
            @click="handleEdit(scope.row)"
            >{{ getButtonTitle(ButtonAuth.SYS_MENU_EDIT) }}</el-button
          >
        </template>

        <template v-if="scope.row.menuId !== 0 && checkButtonAuth(ButtonAuth.SYS_MENU_DELETE)">
          <el-popconfirm title="确定删除?" @confirm="handleDelete(scope.row)">
            <template #reference>
              <el-button :type="getButtonType(ButtonAuth.SYS_MENU_DELETE)" size="small">{{
                getButtonTitle(ButtonAuth.SYS_MENU_DELETE)
              }}</el-button>
            </template>
          </el-popconfirm>
        </template>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog title="新增/编辑" v-model="dialogVisible" width="600px" :before-close="handleClose">
    <el-form :model="form" :rules="editFormRules" ref="form" label-width="100px">
      <el-form-item label="祖先菜单" prop="parentId">
        <el-tree-select v-model="form.parentId" :props="props" :data="content" check-strictly />
      </el-form-item>

      <el-form-item label="标题" prop="title" label-width="100px">
        <el-input v-model="form.title" autocomplete="off" />
      </el-form-item>

      <el-form-item label="图标" prop="icon" label-width="100px">
        <el-input v-model="form.icon" autocomplete="off" />
      </el-form-item>
      <el-form-item label="Url" prop="url" label-width="100px">
        <el-input v-model="form.url" autocomplete="off" />
      </el-form-item>

      <el-form-item label="组件名" prop="name" label-width="100px">
        <el-input v-model="form.name" autocomplete="off" />
      </el-form-item>

      <el-form-item label="组件URI" prop="component" label-width="100px">
        <el-input v-model="form.component" autocomplete="off" />
      </el-form-item>

      <el-form-item label="类型" prop="type" label-width="100px">
        <el-radio-group v-model="form.type">
          <el-radio :value="RoutesEnum.CATALOGUE">分类</el-radio>
          <el-radio :value="RoutesEnum.MENU">菜单</el-radio>
          <el-radio :value="RoutesEnum.BUTTON">按钮</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="状态" prop="status" label-width="100px">
        <el-radio-group v-model="form.status">
          <el-radio :value="Status.NORMAL">正常</el-radio>
          <el-radio :value="Status.BLOCK">禁用</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="排序" prop="orderNum" label-width="100px">
        <el-input-number v-model="form.orderNum" :min="1" label="Order Number">1</el-input-number>
      </el-form-item>

      <el-form-item label-width="450px">
        <el-button type="primary" @click="submitForm(formRef!)">Submit</el-button>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<style scoped>
@import '@/assets/main.css';

.button-form .el-form-item {
  margin-right: 10px;
}
</style>
