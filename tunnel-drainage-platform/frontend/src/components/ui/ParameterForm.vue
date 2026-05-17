<template>
  <div class="form-container">
  <el-form :model="formData" :rules="formRules" ref="formRef" label-width="140px" size="small">
    <el-collapse v-model="activeNames">

      <el-collapse-item title="📍 基础定位与地质水文参数" name="1">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="隧道类型">
              <el-radio-group v-model="paramStore.activeTunnelType" @change="paramStore.switchTunnelType">
                <el-radio value="single">单洞隧道</el-radio>
                <el-radio value="double">双洞隧道</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="分区起点里程(m)" prop="start_chainage">
              <el-input-number v-model="formData.start_chainage" :controls="false" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分区终点里程(m)" prop="end_chainage">
              <el-input-number v-model="formData.end_chainage" :controls="false" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">

          <el-col :span="12">
            <el-form-item label="岩体渗透系数">
              <el-input-number v-model="formData.K" :step="0.1" />
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item label="初始地下水头(m)">
              <el-input-number v-model="formData.h" :step="1" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="年降雨量(mm)">
              <el-input-number v-model="formData.p_mm" :step="100" />
            </el-form-item>
          </el-col>

          <el-col :span="12" v-if="formData.tunnel_type === 'double'">
            <el-form-item label="下边界水头(m)">
              <el-input-number v-model="formData.ha" :step="0.5" />
            </el-form-item>
          </el-col>
        </el-row>





        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="隧道埋深(m)">
              <el-input-number v-model="formData.c" :step="1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="围岩级别(1-6)">
              <el-input-number v-model="formData.grades" :min="1" :max="6" :step="1" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="灌溉条件">
              <el-select v-model="formData.cn_condition">
                <el-option label="灌溉良好" value="灌溉良好" />
                <el-option label="灌溉较差" value="灌溉较差" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用地类型">
              <el-select v-model="formData.land_use">
                <el-option v-for="item in ['工业用地', '商业用地', '居住地', '农业用地', '牧草地', '林地']" :key="item" :label="item"
                  :value="item" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>


      </el-collapse-item>

      <el-collapse-item title="📏 结构尺寸参数" name="2">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="隧道等效内半径(m)">
              <el-input-number v-model="formData.r" :step="0.5" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="初支外半径(m)">
              <el-input-number v-model="formData.r1" :step="0.5" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="二衬外半径(m)">
              <el-input-number v-model="formData.r2" :step="0.5" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="注浆圈外半径(m)">
              <el-input-number v-model="formData.rg" :step="0.5" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="隧道高宽比(h/w)">
              <el-input-number v-model="formData.aspect_ratio" :step="0.1" />
            </el-form-item>
          </el-col>
          <el-col :span="12" , v-if="formData.tunnel_type === 'double'">
            <el-form-item label="双洞中心间距(m)">
              <el-input-number v-model="formData.D_spacing" :step="1" />
            </el-form-item>
          </el-col>
        </el-row>


      </el-collapse-item>

      <el-collapse-item title="🧱 材料属性参数" name="3">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="混凝土等级">
              <el-select v-model="formData.concrete_grade">
                <el-option v-for="grade in ['C15', 'C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50']" :key="grade"
                  :label="grade" :value="grade" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="双侧排水设置">
              <el-switch v-model="formData.double_side" active-text="双侧" inactive-text="单侧" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="钢筋类型">
              <el-select v-model="formData.rebar_type">
                <el-option label="HRB300" value="HRB300" />
                <el-option label="HRB400" value="HRB400" />
                <el-option label="HRB500" value="HRB500" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="配筋面积(m²)">
              <el-input-number v-model="formData.Ag" :step="0.001" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="注浆圈渗透系数">
              <el-input-number v-model="formData.Kg" :step="0.01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="初支渗透系数">
              <el-input-number v-model="formData.K1" :step="0.001" />
            </el-form-item>
          </el-col>

        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="二衬渗透系数">
              <el-input-number v-model="formData.K2" :step="0.001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="纵向排水管水力坡降">
              <el-input-number v-model="formData.I_long" :step="0.01" />
            </el-form-item>
          </el-col>

        </el-row>



        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="涌水量折减系数">
              <el-input-number v-model="formData.beta2" :step="0.1" :max="1" />
            </el-form-item>
          </el-col>
         

        </el-row>



      </el-collapse-item>

      <el-collapse-item title="⚙️ 高级默认参数设置 )" name="4">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="容许安全系数">
              <el-input-number v-model="formData.tol_safety_factor" :step="0.1" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="水的重度(kN/m³)">
              <el-input-number v-model="formData.gamma" :step="0.1" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="钢筋保护层厚度(mm)">
              <el-input-number v-model="formData.as_mm" :step="1" />
            </el-form-item>
          </el-col>

          <el-col :span="12">
            <el-form-item label="规范最大允许盲管间距(m)">
              <el-input-number v-model="formData.S_code_max" :step="1" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="工程实际最小允许间距(m)">
              <el-input-number v-model="formData.S_min" :step="0.5" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="环向管默认内径(m)">
              <el-input-number v-model="formData.d_ring_default" :step="0.01" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="纵向管默认内径(m)">
              <el-input-number v-model="formData.d_long_default" :step="0.01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="横向管默认内径(m)">
              <el-input-number v-model="formData.d_lat_default" :step="0.01" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">

          <el-col :span="12">
            <el-form-item label="纵向排水管曼宁粗糙度">
              <el-input-number v-model="formData.n_long" :step="0.001" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="环向排水管曼宁粗糙度">
              <el-input-number v-model="formData.n_ring" :step="0.001" />
            </el-form-item>
          </el-col>
        </el-row>



        <el-row :gutter="20">

          <el-col :span="12">
            <el-form-item label="环向排水管水力坡降">
              <el-input-number v-model="formData.I_ring" :step="0.01" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="横向排水管曼宁粗糙度">
              <el-input-number v-model="formData.n_lat" :step="0.001" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">

          <el-col :span="12">
            <el-form-item label="横向排水管水力坡降">
              <el-input-number v-model="formData.I_lat" :step="0.01" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-collapse-item>

    </el-collapse>


    <!-- [新增] 表单底部操作区 -->
      <div class="form-actions">
        <el-button type="success" plain icon="UploadCloud" @click="saveDialogVisible = true">
          另存为至参数库 (数据沉淀)
        </el-button>
      </div>
  </el-form>
<!-- [新增] 入库参数配置弹窗 -->
    <el-dialog v-model="saveDialogVisible" title="固化工程参数" width="400px" destroy-on-close>
      <el-form :model="saveForm" label-width="100px" size="default">
        <el-form-item label="工程命名" required>
          <el-input v-model="saveForm.projectName" placeholder="如: 晏家隧道-K20+100段" />
        </el-form-item>
        <el-form-item label="工程分类" required>
          <el-select v-model="saveForm.tunnelClass" placeholder="选择隧道交通属性" style="width: 100%">
            <el-option label="城市道路" value="城市道路" />
            <el-option label="城市轨道" value="城市轨道" />
            <el-option label="公路" value="公路" />
            <el-option label="铁路" value="铁路" />
            <el-option label="水工" value="水工" />
            <el-option label="综合管廊" value="综合管廊" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitToDatabase" :loading="isSaving">确认入库</el-button>
      </template>
    </el-dialog>
  </div>

</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useParameterStore } from '@/store/parameterStore';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import apiClient from '@/api/index'; // [修改] 使用已封装好端口与拦截器的 Axios 实例

const paramStore = useParameterStore();
const formRef = ref<FormInstance>();
const activeNames = ref(['1', '2', '3']); // 默认展开核心区，折叠高级区(4)

// 通过计算属性映射当前负荷数据，保障与兄弟组件响应式同步
const formData = computed(() => paramStore.currentPayload);

// 自定义里程校验规则：确保空间拼装基准逻辑正确
const validateChainage = (rule: any, value: any, callback: any) => {
  if (formData.value.end_chainage <= formData.value.start_chainage) {
    callback(new Error('终点里程应当大于起点里程，请检查输入'));
  } else {
    callback();
  }
};

const formRules = ref<FormRules>({
  start_chainage: [{ required: true, message: '请输入起点里程', trigger: 'blur' }],
  end_chainage: [
    { required: true, message: '请输入终点里程', trigger: 'blur' },
    { validator: validateChainage, trigger: 'blur' }
  ]
});

// ==========================================
// [新增逻辑] 脏数据拦截机制与数据库写入
// ==========================================

// 1. 深度监听双向绑定：由于 v-model 会直接修改 Store 对象，需利用订阅器主动触发脏标记
paramStore.$subscribe((mutation, state) => {
  if (!state.isDirty && state.currentResults) {
    state.isDirty = true;
    state.currentResults = null;
  }
}, { detached: true });

// 2. 数据库写入交互状态
const saveDialogVisible = ref(false);
const isSaving = ref(false);
const saveForm = ref({
  projectName: '',
  tunnelClass: '公路'
});

const submitToDatabase = async () => {
  if (!saveForm.value.projectName) {
    ElMessage.warning('工程命名不能为空');
    return;
  }
  isSaving.value = true;
  try {
    const payload = {
      project_name: saveForm.value.projectName,
      tunnel_type: saveForm.value.tunnelClass,
      parameters_json: paramStore.currentPayload,
      results_json: paramStore.currentResults || null
    };

    // 原代码：await axios.post('/api/v1/database/parameters', payload);
    // [修改] 使用 apiClient，剥离重复的前缀
    await apiClient.post('/database/parameters', payload);
    
    ElMessage.success('工程参数已成功固化至数据库');
    saveDialogVisible.value = false;
    saveForm.value.projectName = ''; // 重置表单
  } catch (error) {
    ElMessage.error('入库失败: ' + (error as any).message);
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.form-container {
  padding-bottom: 20px;
}
.form-actions {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  border-top: 1px dashed var(--sys-border);
  padding-top: 15px;
}
</style>