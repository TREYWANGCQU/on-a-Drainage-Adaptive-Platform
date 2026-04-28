<template>
  <el-form :model="formData" :rules="formRules" ref="formRef" label-width="140px" size="small">
    <el-collapse v-model="activeNames">

      <el-collapse-item title="📍 基础定位与地质水文参数" name="1">
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="隧道类型">
              <el-radio-group v-model="paramStore.activeTunnelType" @change="paramStore.switchTunnelType">
                <el-radio label="single">单洞隧道</el-radio>
                <el-radio label="double">双洞隧道</el-radio>
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
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useParameterStore } from '@/store/parameterStore';
import type { FormInstance, FormRules } from 'element-plus';

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
</script>