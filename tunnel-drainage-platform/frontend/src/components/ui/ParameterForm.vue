<!-- frontend/src/components/ui/ParameterForm.vue -->
<template>
  <div class="form-container">
    <el-form :model="formData" :rules="formRules" ref="formRef" label-width="140px" size="small">
      <el-collapse v-model="activeNames">

        <el-collapse-item title="📍 基础定位与地质水文参数" name="1">
          <el-row :gutter="20">
            <el-col :span="24">
              <el-form-item label="隧道类型">
                <el-radio-group :model-value="paramStore.activeTunnelType" @change="paramStore.switchTunnelType">
                  <el-radio value="single">单洞隧道</el-radio>
                  <el-radio value="double">双洞隧道</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="分区起点里程(m)" prop="start_chainage">
                <el-input-number :model-value="formData.start_chainage" @change="(val) => paramStore.updateParam('start_chainage', val)" :controls="false" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="分区终点里程(m)" prop="end_chainage">
                <el-input-number :model-value="formData.end_chainage" @change="(val) => paramStore.updateParam('end_chainage', val)" :controls="false" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="岩体渗透系数(m/d)">
                <el-input-number :model-value="formData.K" @change="(val) => paramStore.updateParam('K', val)" :step="0.1" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="初始地下水头(m)">
                <el-input-number :model-value="formData.h" @change="(val) => paramStore.updateParam('h', val)" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="年降雨量(mm)">
                <el-input-number :model-value="formData.p_mm" @change="(val) => paramStore.updateParam('p_mm', val)" :step="100" />
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="formData.tunnel_type === 'double'">
              <el-form-item label="下边界水头(m)">
                <el-input-number :model-value="formData.ha" @change="(val) => paramStore.updateParam('ha', val)" :step="0.5" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="隧道埋深(m)">
                <el-input-number :model-value="formData.c" @change="(val) => paramStore.updateParam('c', val)" :step="1" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="围岩级别(1-6)">
                <el-input-number :model-value="formData.grades" @change="(val) => paramStore.updateParam('grades', val)" :min="1" :max="6" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="灌溉条件">
                <el-select :model-value="formData.cn_condition" @change="(val) => paramStore.updateParam('cn_condition', val)">
                  <el-option label="灌溉良好" value="灌溉良好" />
                  <el-option label="灌溉较差" value="灌溉较差" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="用地类型">
                <el-select :model-value="formData.land_use" @change="(val) => paramStore.updateParam('land_use', val)">
                  <el-option v-for="item in ['工业用地', '商业用地', '居住地', '农业用地', '牧草地', '林地']" :key="item" :label="item" :value="item" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-collapse-item>

        <el-collapse-item title="📏 结构尺寸参数" name="2">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="隧道等效内半径(m)">
                <el-input-number :model-value="formData.r" @change="(val) => paramStore.updateParam('r', val)" :step="0.5" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="二衬外半径(m)">
                <el-input-number :model-value="formData.r1" @change="(val) => paramStore.updateParam('r1', val)" :step="0.5" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="初支外半径(m)">
                <el-input-number :model-value="formData.r2" @change="(val) => paramStore.updateParam('r2', val)" :step="0.5" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="注浆圈外半径(m)">
                <el-input-number :model-value="formData.rg" @change="(val) => paramStore.updateParam('rg', val)" :step="0.5" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="隧道高宽比(h/w)">
                <el-input-number :model-value="formData.aspect_ratio" @change="(val) => paramStore.updateParam('aspect_ratio', val)" :step="0.1" />
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="formData.tunnel_type === 'double'">
              <el-form-item label="双洞中心间距(m)">
                <el-input-number :model-value="formData.D_spacing" @change="(val) => paramStore.updateParam('D_spacing', val)" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-collapse-item>

        <el-collapse-item title="🧱 材料属性参数" name="3">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="混凝土等级">
                <el-select :model-value="formData.concrete_grade" @change="(val) => paramStore.updateParam('concrete_grade', val)">
                  <el-option v-for="grade in ['C15', 'C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50']" :key="grade" :label="grade" :value="grade" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="双侧排水设置">
                <el-switch :model-value="formData.double_side" @change="(val) => paramStore.updateParam('double_side', val)" active-text="双侧" inactive-text="单侧" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="钢筋类型">
                <el-select :model-value="formData.rebar_type" @change="(val) => paramStore.updateParam('rebar_type', val)">
                  <el-option label="HRB300" value="HRB300" />
                  <el-option label="HRB400" value="HRB400" />
                  <el-option label="HRB500" value="HRB500" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="配筋面积(m²)">
                <el-input-number :model-value="formData.Ag" @change="(val) => paramStore.updateParam('Ag', val)" :step="0.001" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="注浆圈渗透系数(m/d)">
                <el-input-number :model-value="formData.Kg" @change="(val) => paramStore.updateParam('Kg', val)" :step="0.01" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="初支渗透系数(m/d)">
                <el-input-number :model-value="formData.K1" @change="(val) => paramStore.updateParam('K1', val)" :step="0.001" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="二衬渗透系数(m/d)">
                <el-input-number :model-value="formData.K2" @change="(val) => paramStore.updateParam('K2', val)" :step="0.001" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="纵向排水管水力坡降">
                <el-input-number :model-value="formData.I_long" @change="(val) => paramStore.updateParam('I_long', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-collapse-item>

        <el-collapse-item title="⚙️ 高级默认参数设置" name="4">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="容许安全系数">
                <el-input-number :model-value="formData.tol_safety_factor" @change="(val) => paramStore.updateParam('tol_safety_factor', val)" :step="0.1" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="水的重度(kN/m³)">
                <el-input-number :model-value="formData.gamma" @change="(val) => paramStore.updateParam('gamma', val)" :step="0.1" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="钢筋保护层厚度(mm)">
                <el-input-number :model-value="formData.as_mm" @change="(val) => paramStore.updateParam('as_mm', val)" :step="1" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="规范最大允许盲管间距(m)">
                <el-input-number :model-value="formData.S_code_max" @change="(val) => paramStore.updateParam('S_code_max', val)" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="工程实际最小允许间距(m)">
                <el-input-number :model-value="formData.S_min" @change="(val) => paramStore.updateParam('S_min', val)" :step="0.5" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="环向管默认内径(m)">
                <el-input-number :model-value="formData.d_ring_default" @change="(val) => paramStore.updateParam('d_ring_default', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="纵向管默认内径(m)">
                <el-input-number :model-value="formData.d_long_default" @change="(val) => paramStore.updateParam('d_long_default', val)" :step="0.01" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="横向管默认内径(m)">
                <el-input-number :model-value="formData.d_lat_default" @change="(val) => paramStore.updateParam('d_lat_default', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="纵向排水管曼宁粗糙度">
                <el-input-number :model-value="formData.n_long" @change="(val) => paramStore.updateParam('n_long', val)" :step="0.001" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="环向排水管曼宁粗糙度">
                <el-input-number :model-value="formData.n_ring" @change="(val) => paramStore.updateParam('n_ring', val)" :step="0.001" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="环向排水管水力坡降">
                <el-input-number :model-value="formData.I_ring" @change="(val) => paramStore.updateParam('I_ring', val)" :step="0.01" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="横向排水管曼宁粗糙度">
                <el-input-number :model-value="formData.n_lat" @change="(val) => paramStore.updateParam('n_lat', val)" :step="0.001" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="横向排水管水力坡降">
                <el-input-number :model-value="formData.I_lat" @change="(val) => paramStore.updateParam('I_lat', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-collapse-item>

      </el-collapse>

      <!-- 表单底部操作区 -->
      <div class="form-actions">
        <el-button type="success" plain icon="UploadCloud" @click="saveDialogVisible = true">
          另存为至参数库 (数据沉淀)
        </el-button>
      </div>
    </el-form>

    <!-- 入库参数配置弹窗 -->
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
import { ref, computed } from 'vue';
import { useParameterStore } from '@/store/parameterStore';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import apiClient from '@/api/index'; // 使用已封装好端口与拦截器的 Axios 实例

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

// 自定义几何半径级联校验规则：r < r1 < r2 <= rg
const validateRadius = (rule: any, value: any, callback: any) => {
  const { r, r1, r2, rg } = formData.value;
  if (r >= r1) {
    callback(new Error('二衬内半径 r 必须小于二衬外半径 r1'));
  } else if (r1 >= r2) {
    callback(new Error('二衬外半径 r1 必须小于初支外半径 r2'));
  } else if (r2 > rg) {
    callback(new Error('初支外半径 r2 不能大于注浆圈外半径 rg'));
  } else {
    callback();
  }
};

// 自定义地下水头与埋深校验：h <= c
const validateWaterHead = (rule: any, value: any, callback: any) => {
  if (formData.value.h > formData.value.c) {
    callback(new Error('初始地下水头 h 不宜超过隧道埋深 c'));
  } else {
    callback();
  }
};

const formRules = ref<FormRules>({
  start_chainage: [{ required: true, message: '请输入起点里程', trigger: 'blur' }],
  end_chainage: [
    { required: true, message: '请输入终点里程', trigger: 'blur' },
    { validator: validateChainage, trigger: 'blur' }
  ],
  r: [{ validator: validateRadius, trigger: 'change' }],
  r1: [{ validator: validateRadius, trigger: 'change' }],
  r2: [{ validator: validateRadius, trigger: 'change' }],
  rg: [{ validator: validateRadius, trigger: 'change' }],
  h: [{ validator: validateWaterHead, trigger: 'change' }]
});

// ==========================================
// 脏数据拦截机制与数据库写入
// ==========================================

// 深度监听双向绑定：由于 v-model 会直接修改 Store 对象，需利用订阅器主动触发脏标记
paramStore.$subscribe((mutation, state) => {
  if (!state.isDirty && state.currentResults) {
    state.isDirty = true;
    state.currentResults = null;
  }
}, { detached: true });

// 数据库写入交互状态
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

    // 使用 apiClient，剥离重复的前缀
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