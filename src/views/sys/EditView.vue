<script lang="ts" setup>
import { defineAsyncComponent, onUnmounted, reactive, ref, watch } from 'vue'
import { type UploadFile, type UploadInstance, type UploadProps, type UploadRawFile, type UploadRequestOptions, type UploadUserFile, genFileId, type FormRules, type FormInstance } from 'element-plus'
import { GET, POST } from '@/http/http'
import { FieldName, FieldType, OperaColor, OperateTypeCode, ParaInfo, Status } from '@/type/entity'
import { useRoute } from 'vue-router'
import type { BlogEdit } from '@/type/entity'
import router from '@/router'
import { tabStore, blogsStore } from '@/stores/store'
import { Client } from '@stomp/stompjs'
import EditorLoadingItem from '@/components/sys/EditorLoadingItem.vue'
import { checkAccessToken } from '@/utils/tools'

let timer: NodeJS.Timeout

const client = new Client({
  brokerURL: `${import.meta.env.VITE_BASE_WS_URL}/edit`,
  connectHeaders: { "Authorization": localStorage.getItem('accessToken')!, "Type": "EDIT" },
  reconnectDelay: 5000,
  heartbeatIncoming: 4000,
  heartbeatOutgoing: 4000,
})

const connect = () => {
  const key = form.id ? form.userId + '/' + form.id : form.userId?.toString()
  client.onConnect = _frame =>
    client.subscribe('/edits/push/all/' + key, _res => pushAllData())

  client.activate()
  client.onStompError = frame =>
    ElNotification.error({
      title: 'Broker reported error: ' + frame.headers['message'],
      message: 'Additional details: ' + frame.body,
      showClose: true
    })
}

type Form = {
  id?: number
  userId?: number
  title?: string
  description?: string
  content?: string
  status?: number
  link?: string
}

const form: Form = reactive({
  id: undefined,
  userId: undefined,
  title: undefined,
  description: undefined,
  content: undefined,
  status: undefined,
  link: undefined
})

type PushActionForm = {
  id?: number
  contentChange?: string | number
  operateTypeCode?: number
  version?: number
  indexStart?: number
  indexEnd?: number
  field?: string
  paraNo?: number
}

const pushActionForm: PushActionForm = {
  id: undefined,
  contentChange: undefined,
  operateTypeCode: undefined,
  version: undefined,
  indexStart: undefined,
  indexEnd: undefined,
  field: undefined,
  paraNo: undefined,
}

let version = 0
//中文输入法的问题
let isComposing = false
let fieldType: string

const pushAllData = async () => {
  await POST<null>('/sys/blog/push/all', form)
  version = 0
  if (transColor.value !== OperaColor.WARNING) {
    transColor.value = OperaColor.WARNING
  }
}

const pushActionData = (pushActionForm: PushActionForm) => {
  client.publish({
    destination: '/app/edit/push/action',
    body: JSON.stringify(pushActionForm)
  })
  version++
  if (transColor.value !== OperaColor.SUCCESS) {
    transColor.value = OperaColor.SUCCESS
  }
}

const clearPushActionForm = () => {
  pushActionForm.contentChange = undefined
  pushActionForm.indexEnd = undefined
  pushActionForm.indexStart = undefined
  pushActionForm.operateTypeCode = undefined
  pushActionForm.version = undefined
  pushActionForm.field = undefined
  pushActionForm.paraNo = undefined
}

watch(() => form.description, (n, o) => {
  if (!client.connected || (!n && !o) || isComposing) return
  commonPreDeal(FieldType.NON_PARA, FieldName.DESCRIPTION)
  deal(n, o)
})

watch(() => form.status, (n, o) => {
  if (!client.connected || (!n && !o) || isComposing) return
  commonPreDeal(FieldType.NON_PARA, FieldName.STATUS)
  pushActionForm.operateTypeCode = OperateTypeCode.STATUS
  pushActionForm.contentChange = form.status
  pushActionData(pushActionForm)
})

watch(() => form.link, (n, o) => {
  if (!client.connected || (!n && !o) || isComposing) return
  commonPreDeal(FieldType.NON_PARA, FieldName.LINK)
  deal(n, o)
})

watch(() => form.title, (n, o) => {
  if (!client.connected || (!n && !o) || isComposing) return
  commonPreDeal(FieldType.NON_PARA, FieldName.TITLE)
  deal(n, o)
})

watch(() => form.content, (n, o) => {
  if (!client.connected || (!n && !o) || isComposing) return
  commonPreDeal(FieldType.PARA, FieldName.CONTENT)

  const nArr = n?.split(ParaInfo.PARA_SPLIT)
  const oArr = o?.split(ParaInfo.PARA_SPLIT)

  //本段内操作
  if (nArr?.length === oArr?.length) {
    for (let i = 0; i < nArr?.length!; i++) {
      //理论上一个动作改不了很多段
      if (nArr![i] !== oArr![i]) {
        pushActionForm.paraNo = i + 1
        deal(nArr![i], oArr![i])
      }
    }
    return
  }
  //向后新增段
  const nLen = nArr?.length!
  const oLen = oArr?.length!
  if (nLen - 1 === oLen && nArr![oLen - 1] + '\n' === oArr![oLen - 1] && nArr![oLen] === '') {
    //每段必须相同，否则推全量
    for (let i = 0; i < nLen; i++) {
      if (nArr![i] !== oArr![i]) {
        pushAllData()
        return
      }
    }
    pushActionForm.paraNo = nLen
    pushActionForm.operateTypeCode = OperateTypeCode.PARA_SPLIT_APPEND
    pushActionData(pushActionForm)
    return
  }

  //向前减少段
  if (nLen + 1 === oLen && nArr![nLen - 1] === oArr![nLen - 1] + '\n' && oArr![nLen] === '') {
    for (let i = 0; i < oLen; i++) {
      if (nArr![i] !== oArr![i]) {
        pushAllData()
        return
      }
    }
    pushActionForm.paraNo = oLen
    pushActionForm.operateTypeCode = OperateTypeCode.PARA_SPLIT_SUBTRACT
    pushActionData(pushActionForm)
    return
  }

  //推全量
  pushAllData()
})

const commonPreDeal = (fieldTypeParam: string, opreateField: string) => {
  clearPushActionForm()
  pushActionForm.field = opreateField
  pushActionForm.id = form.id
  pushActionForm.version = version
  fieldType = fieldTypeParam
}

const deal = (n: string | undefined, o: string | undefined) => {
  //全部删除
  if (!n) {
    if (fieldType === FieldType.PARA) {
      pushActionForm.operateTypeCode = OperateTypeCode.PARA_REMOVE
    } else {
      pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_REMOVE
    }
    pushActionData(pushActionForm)
    return
  }

  //初始化新增
  if (!o) {
    pushActionForm.contentChange = n
    if (fieldType === FieldType.PARA) {
      pushActionForm.operateTypeCode = OperateTypeCode.PARA_TAIL_APPEND
    } else {
      pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_TAIL_APPEND
    }
    pushActionData(pushActionForm)
    return
  }

  let nLen = n.length
  let oLen = o.length
  const minLen = Math.min(nLen, oLen)

  let indexStart = oLen
  for (let i = 0; i < minLen; i++) {
    if (n.charAt(i) !== o.charAt(i)) {
      indexStart = i
      break
    }
  }

  if (indexStart === oLen) {
    //向末尾添加
    if (oLen < nLen) {
      pushActionForm.contentChange = n.substring(indexStart)
      if (fieldType === FieldType.PARA) {
        pushActionForm.operateTypeCode = OperateTypeCode.PARA_TAIL_APPEND
      } else {
        pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_TAIL_APPEND
      }
    } else {
      //从末尾删除
      pushActionForm.indexStart = nLen
      if (fieldType === FieldType.PARA) {
        pushActionForm.operateTypeCode = OperateTypeCode.PARA_TAIL_SUBTRACT
      } else {
        pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_TAIL_SUBTRACT
      }
    }
    pushActionData(pushActionForm)
    return
  }

  let oIndexEnd = -1
  let nIndexEnd = -1
  for (let i = oLen - 1, j = nLen - 1; i >= 0 && j >= 0; i--, j--) {
    if (o.charAt(i) !== n.charAt(j)) {
      oIndexEnd = i + 1
      nIndexEnd = j + 1
      break
    }
  }

  if (oIndexEnd === -1) {
    //从开头添加
    if (oLen < nLen) {
      pushActionForm.contentChange = n.substring(0, nLen - oLen)
      if (fieldType === FieldType.PARA) {
        pushActionForm.operateTypeCode = OperateTypeCode.PARA_HEAD_APPEND
      } else {
        pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_HEAD_APPEND
      }
    } else {
      //从开头删除
      pushActionForm.indexStart = oLen - nLen
      if (fieldType === FieldType.PARA) {
        pushActionForm.operateTypeCode = OperateTypeCode.PARA_HEAD_SUBTRACT
      } else {
        pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_HEAD_SUBTRACT
      }
    }
    pushActionData(pushActionForm)
    return
  }

  //中间插入重复字符
  if (indexStart > oIndexEnd) {
    let len = indexStart - oIndexEnd + 1
    let contentChange

    //增
    if (nLen > oLen) {
      contentChange = n.substring(oIndexEnd, oIndexEnd + len)
      pushActionForm.indexStart = oIndexEnd
      pushActionForm.indexEnd = oLen - (nLen - (oIndexEnd + len))
      //删
    } else {
      contentChange = n.substring(oIndexEnd - 1, oIndexEnd - 1 + len)
      pushActionForm.indexStart = oIndexEnd - 1
      pushActionForm.indexEnd = oLen - (nLen - (len + oIndexEnd - 1))
    }
    pushActionForm.contentChange = contentChange
    if (fieldType === FieldType.PARA) {
      pushActionForm.operateTypeCode = OperateTypeCode.PARA_REPLACE
    } else {
      pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_REPLACE
    }
    pushActionData(pushActionForm)
    return
  }

  //中间正常插入
  if (indexStart <= oIndexEnd && indexStart <= nIndexEnd) {

    const contentChange = n.substring(indexStart, nIndexEnd)
    pushActionForm.contentChange = contentChange
    if (fieldType === FieldType.PARA) {
      pushActionForm.operateTypeCode = OperateTypeCode.PARA_REPLACE
    } else {
      pushActionForm.operateTypeCode = OperateTypeCode.NON_PARA_REPLACE
    }
    pushActionForm.indexStart = indexStart
    pushActionForm.indexEnd = oIndexEnd
    pushActionData(pushActionForm)
    return
  }
  //全不满足直接推全量数据
  pushAllData()
}

const transColor = ref(OperaColor.SUCCESS)
const fileList = ref<UploadUserFile[]>([])
const dialogVisible = ref(false)
const dialogImageUrl = ref('')
const disabled = ref(false)
const route = useRoute()
let blogId = route.query.id

const uploadInstance = ref<UploadInstance>()
const formRef = ref<FormInstance>()
const formRules = reactive<FormRules<Form>>({
  title: [
    { required: true, message: '请输入标题', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入描述', trigger: 'blur' }
  ],
  content: [
    { required: true, message: '请输入内容', trigger: 'blur' }
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' }
  ]
})

const loadEditContent = async () => {
  let data
  if (!blogId) {
    data = await GET<BlogEdit>('/sys/blog/echo')
  } else {
    data = await GET<BlogEdit>(`/sys/blog/echo?blogId=${blogId}`)
  }
  form.title = data.title
  form.description = data.description
  form.content = data.content
  form.link = data.link
  form.status = data.status
  form.id = data.id
  form.userId = data.userId
  version = data.version + 1
  if (data.link) {
    fileList.value.push({
      name: 'Cover',
      url: data.link
    })
  }
}

const upload = async (image: UploadRequestOptions) => {
  await uploadFile(image.file)
}

const uploadFile = async (file: UploadRawFile) => {
  const formdata = new FormData()
  formdata.append('image', file)
  const url = await POST<string>('sys/blog/oss/upload', formdata)
  fileList.value.push({
    name: file.name,
    url: url
  })
  form.link = url
  ElNotification({
    title: '操作成功',
    message: '图片上传成功',
    type: 'success',
  })
}

const handleRemove = async (_file: UploadFile) => {
  await GET<null>(`/sys/blog/oss/delete?url=${form.link}`)
  form.link = ''
  fileList.value = []
}

const submitForm = async (ref: FormInstance) => {
  await ref.validate(async (valid, _fields) => {
    if (valid) {
      await POST<null>('/sys/blog/save', form)
      ElNotification({
        title: '操作成功',
        message: '编辑成功',
        type: 'success',
      })
      blogsStore().pageNum = 1
      router.push({
        name: "system-blogs"
      })
    }
  })
}

const handleExceed: UploadProps['onExceed'] = async (files, _uploadFiles) => {
  uploadInstance.value!.clearFiles()
  const file = files[0] as UploadRawFile
  await uploadFile(file)
  file.uid = genFileId()
  uploadInstance.value!.handleStart(file)
}

const handlePictureCardPreview = (file: UploadFile) => {
  dialogImageUrl.value = file.url!
  dialogVisible.value = true
}

const beforeAvatarUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (rawFile.type !== 'image/jpeg' && rawFile.type !== 'image/png') {
    ElMessage.error('Avatar picture must be JPG/PNG format!')
    return false
  } else if (rawFile.size / 1024 / 1024 > 5) {
    ElMessage.error('Avatar picture size can not exceed 5MB!')
    return false
  }
  return true
}

const CustomEditorItem = defineAsyncComponent({
  loader: () => import('@/components/sys/EditorItem.vue'),
  loadingComponent: EditorLoadingItem,
  delay: 200,
  errorComponent: EditorLoadingItem,
  timeout: 3000
})

onUnmounted(() => {
  clearInterval(timer)
  client.deactivate()
})

let reconnected = false;
(async () => {
  await loadEditContent()
  tabStore().addTab({ title: '编辑博客', name: 'system-edit' })
  connect()
  timer = setInterval(async () => {
    if (!client.connected) {
      ElNotification.warning("websocket reconnection ...")
      checkAccessToken(localStorage.getItem('accessToken')!)
      connect()
      reconnected = true
    }
    if (reconnected && client.connected) {
      await loadEditContent()
      ElNotification.success("websocket reconnected")
      reconnected = false
    }
  }, 5000)
})()
</script>

<template>
  <div class="father">
    <el-form :model="form" :rules="formRules" ref="formRef">
      <el-form-item class="title" prop="title">
        <el-input v-model="form.title" placeholder="标题" maxlength="20" />
      </el-form-item>

      <el-form-item class="desc" prop="description">
        <el-input autosize type="textarea" v-model="form.description" placeholder="摘要" maxlength="60" />
      </el-form-item>

      <el-form-item class="status" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio :value=Status.NORMAL>公开</el-radio>
          <el-radio :value=Status.BLOCK>隐藏</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item class="cover">
        <span style="margin-right: 10px;">封面</span>
        <el-upload action="#" list-type="picture-card" :before-upload="beforeAvatarUpload" :limit="1"
          :on-exceed="handleExceed" :http-request="upload" :on-remove="handleRemove" :file-list="fileList"
          ref="uploadInstance">
          <el-icon>
            <Plus />
          </el-icon>
          <template #file="{ file }">
            <div>
              <img class="el-upload-list__item-thumbnail" :src="file.url" alt="" />
              <span class="el-upload-list__item-actions">
                <span class="el-upload-list__item-preview" @click="handlePictureCardPreview(file)">
                  <el-icon><zoom-in /></el-icon>
                </span>
                <span v-if="!disabled" class="el-upload-list__item-delete" @click="handleRemove(file)">
                  <el-icon>
                    <Delete />
                  </el-icon>
                </span>
              </span>
            </div>
          </template>
        </el-upload>

        <el-dialog v-model="dialogVisible">
          <img style="width: 100%;" :src="dialogImageUrl" alt="Preview Image" />
        </el-dialog>
      </el-form-item>

      <el-form-item class="content" prop="content">
        <CustomEditorItem v-model:content="form.content" v-model:isComposing="isComposing"
          v-model:transColor="transColor" />
      </el-form-item>

      <div class="submit-button">
        <el-button type="primary" @click="submitForm(formRef!)">Submit</el-button>
      </div>
    </el-form>

  </div>
</template>

<style scoped>
.father {
  max-width: 40rem;
  margin: 0 auto
}

.title {
  margin-top: 5px;
  width: 200px
}

.desc {
  margin-top: 5px;
  width: 300px
}

.status {
  margin-top: 5px;
  width: 300px
}

.el-upload__text {
  margin-top: 5px;
  width: 290px
}

.submit-button {
  display: block;
  margin: 10px auto;
  text-align: center
}

.content {
  max-width: 40rem;
  margin: 5px auto
}
</style>