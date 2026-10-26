<!-- frontend/src/components/ui/ParameterForm.vue -->
<template>
  <div class="form-container" ref="formContainerRef">
    <!-- 表单权限软锁指示条 -->
    <div class="form-header-bar">
      <div class="form-title-group">
        <span class="form-title-text">📐 平台参数设置</span>
        <span class="param-count-badge">{{ paramStore.activeTunnelType === 'single' ? '单洞35项' : '双洞36项' }}</span>
      </div>

      <div class="form-lock-control">
        <!-- 快捷全折叠/全展开切换按钮 -->
        <el-tooltip :content="isAllCollapsed ? '展开全部主类' : '收起全部主类'" placement="top">
          <el-button 
            size="small" 
            circle 
            class="collapse-toggle-btn" 
            @click="toggleAllCollapses"
          >
            <el-icon><Fold v-if="!isAllCollapsed" /><Expand v-else /></el-icon>
          </el-button>
        </el-tooltip>

        <el-button 
          v-if="!isFormEditable" 
          size="small" 
          type="primary" 
          plain 
          class="unlock-form-btn"
          @click="handleUnlockClick"
          title="点击输入密码解锁表单参数编辑"
        >
          🔒 解锁
        </el-button>
        <div v-else class="unlocked-indicator">
          <span class="unlocked-badge">🔓</span>
          <el-button link size="small" class="relock-btn" @click="authStore.lockForm()">
            锁定
          </el-button>
        </div>
      </div>
    </div>

    <el-form 
      :model="formData" 
      :rules="formRules" 
      ref="formRef" 
      :label-position="formLabelPosition"
      :label-width="formLabelWidth" 
      size="small" 
      :disabled="!isFormEditable"
      :class="{ 'is-narrow-mode': containerWidth < 420 }"
    >
      <el-collapse v-model="activeNames" @change="handleMainCollapseChange">

        <!-- 1. 🌊 水文地质参数 -->
        <el-collapse-item title="🌊 水文地质参数" name="1">
          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="围岩渗透系数(m/d)">
                <el-input-number :model-value="formData.k_r" @change="(val) => paramStore.updateParam('k_r', val)" :step="0.1" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="初始地下水头(m)" prop="H">
                <el-input-number :model-value="formData.H" @change="(val) => paramStore.updateParam('H', val)" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="年降雨量(mm)">
                <el-input-number :model-value="formData.p_mm" @change="(val) => paramStore.updateParam('p_mm', val)" :step="100" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="围岩级别(1-6)">
                <el-input-number :model-value="formData.grades" @change="(val) => paramStore.updateParam('grades', val)" :min="1" :max="6" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="灌溉条件">
                <el-select :model-value="formData.cn_condition" @change="(val) => paramStore.updateParam('cn_condition', val)">
                  <el-option label="灌溉良好" value="灌溉良好" />
                  <el-option label="灌溉较差" value="灌溉较差" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="用地类型">
                <el-select :model-value="formData.land_use" @change="(val) => paramStore.updateParam('land_use', val)">
                  <el-option v-for="item in ['工业用地', '商业用地', '居住地', '农业用地', '牧草地', '林地']" :key="item" :label="item" :value="item" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 水文地质高级参数内嵌二级折叠 -->
          <div class="nested-sub-collapse">
            <el-collapse v-model="hydroSubActive">
              <el-collapse-item title="⚙️ 高级水文常数设置" name="hydro-adv">
                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="水的重度(kN/m³)">
                      <el-input-number :model-value="formData.gamma" @change="(val) => paramStore.updateParam('gamma', val)" :step="0.1" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-collapse-item>

        <!-- 2. 🏛️ 隧道结构与支护材料参数 -->
        <el-collapse-item title="🏛️ 隧道结构参数" name="2">
          <el-row :gutter="gridGutter">
            <el-col :span="24">
              <el-form-item label="隧道类型">
                <el-radio-group :model-value="paramStore.activeTunnelType" @change="paramStore.switchTunnelType">
                  <el-radio value="single">单洞隧道</el-radio>
                  <el-radio value="double">双洞隧道</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="分区起点里程(m)" prop="start_chainage">
                <el-input-number :model-value="formData.start_chainage" @change="(val) => paramStore.updateParam('start_chainage', val)" :controls="false" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="分区终点里程(m)" prop="end_chainage">
                <el-input-number :model-value="formData.end_chainage" @change="(val) => paramStore.updateParam('end_chainage', val)" :controls="false" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="隧道中心埋深 h_1(m)">
                <el-input-number :model-value="formData.h_1" @change="(val) => paramStore.updateParam('h_1', val)" :step="1" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="二衬内半径 r_0(m)" prop="r_0">
                <el-input-number :model-value="formData.r_0" @change="(val) => paramStore.updateParam('r_0', val)" :step="0.5" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="二衬外半径 r_s(m)" prop="r_s">
                <el-input-number :model-value="formData.r_s" @change="(val) => paramStore.updateParam('r_s', val)" :step="0.5" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="初支外半径 r_p(m)" prop="r_p">
                <el-input-number :model-value="formData.r_p" @change="(val) => paramStore.updateParam('r_p', val)" :step="0.5" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="注浆圈外半径 r_g(m)" prop="r_g">
                <el-input-number :model-value="formData.r_g" @change="(val) => paramStore.updateParam('r_g', val)" :step="0.5" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="断面高宽比(3D)">
                <el-input-number :model-value="formData.aspect_ratio" @change="(val) => paramStore.updateParam('aspect_ratio', val)" :step="0.1" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter" v-if="formData.tunnel_type === 'double'">
            <el-col :span="colSpan">
              <el-form-item label="双洞中心间距(m)">
                <el-input-number :model-value="formData.D_spacing" @change="(val) => paramStore.updateParam('D_spacing', val)" :step="1" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="混凝土等级">
                <el-select :model-value="formData.concrete_grade" @change="(val) => paramStore.updateParam('concrete_grade', val)">
                  <el-option v-for="grade in ['C15', 'C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50']" :key="grade" :label="grade" :value="grade" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="主筋材料级别">
                <el-tag class="rebar-grade-tag">HRB400</el-tag>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="配筋面积(mm²)">
                <el-input-number :model-value="formData.Ag" @change="(val) => paramStore.updateParam('Ag', val)" :step="100" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="注浆圈渗透系数(m/d)">
                <el-input-number :model-value="formData.k_g" @change="(val) => paramStore.updateParam('k_g', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="初支渗透系数(m/d)">
                <el-input-number :model-value="formData.k_p" @change="(val) => paramStore.updateParam('k_p', val)" :step="0.001" />
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="二衬渗透系数(m/d)">
                <el-input-number :model-value="formData.k_s" @change="(val) => paramStore.updateParam('k_s', val)" :step="0.001" />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 结构与材料高级参数内嵌二级折叠 -->
          <div class="nested-sub-collapse">
            <el-collapse v-model="structSubActive">
              <el-collapse-item title="⚙️ 高级结构设计参数" name="struct-adv">
                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="容许安全系数 [K]">
                      <el-input-number :model-value="formData.tol_safety_factor" @change="(val) => paramStore.updateParam('tol_safety_factor', val)" :step="0.1" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="钢筋保护层厚度(mm)">
                      <el-input-number :model-value="formData.as_mm" @change="(val) => paramStore.updateParam('as_mm', val)" :step="1" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-collapse-item>

        <!-- 3. 💧 隧道排水参数 -->
        <el-collapse-item title="💧 隧道排水参数" name="3">
          <el-row :gutter="gridGutter">
            <el-col :span="colSpan">
              <el-form-item label="中间排水沟(3D)">
                <el-radio-group 
                  :model-value="formData.has_central_ditch ?? true" 
                  @change="(val) => paramStore.updateParam('has_central_ditch', val)"
                >
                  <el-radio :value="true">设置(三沟式)</el-radio>
                  <el-radio :value="false">不设置(双侧沟)</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
            <el-col :span="colSpan">
              <el-form-item label="纵向排水管水力坡降">
                <el-input-number :model-value="formData.I_long" @change="(val) => paramStore.updateParam('I_long', val)" :step="0.01" />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 排水管网高级参数内嵌二级折叠 -->
          <div class="nested-sub-collapse">
            <el-collapse v-model="drainSubActive">
              <el-collapse-item title="⚙️ 高级排水管网参数" name="drain-adv">
                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="规范最大盲管间距(m)">
                      <el-input-number :model-value="formData.S_code_max" @change="(val) => paramStore.updateParam('S_code_max', val)" :step="1" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="工程最小盲管间距(m)">
                      <el-input-number :model-value="formData.S_min" @change="(val) => paramStore.updateParam('S_min', val)" :step="0.5" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="环向管默认内径(m)">
                      <el-input-number :model-value="formData.d_ring_default" @change="(val) => paramStore.updateParam('d_ring_default', val)" :step="0.01" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="纵向管默认内径(m)">
                      <el-input-number :model-value="formData.d_long_default" @change="(val) => paramStore.updateParam('d_long_default', val)" :step="0.01" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="横向管默认内径(m)">
                      <el-input-number :model-value="formData.d_lat_default" @change="(val) => paramStore.updateParam('d_lat_default', val)" :step="0.01" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="环向排水管水力坡降">
                      <el-input-number :model-value="formData.I_ring" @change="(val) => paramStore.updateParam('I_ring', val)" :step="0.01" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="横向排水管水力坡降">
                      <el-input-number :model-value="formData.I_lat" @change="(val) => paramStore.updateParam('I_lat', val)" :step="0.01" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="纵向排水管曼宁粗糙度">
                      <el-input-number :model-value="formData.n_long" @change="(val) => paramStore.updateParam('n_long', val)" :step="0.001" />
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="gridGutter">
                  <el-col :span="colSpan">
                    <el-form-item label="环向排水管曼宁粗糙度">
                      <el-input-number :model-value="formData.n_ring" @change="(val) => paramStore.updateParam('n_ring', val)" :step="0.001" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="colSpan">
                    <el-form-item label="横向排水管曼宁粗糙度">
                      <el-input-number :model-value="formData.n_lat" @change="(val) => paramStore.updateParam('n_lat', val)" :step="0.001" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-collapse-item>

      </el-collapse>

      <!-- 表单底部操作区 -->
      <div class="form-actions">
        <el-button type="success" plain icon="UploadCloud" @click="handleOpenSaveDialog">
          另存为至数字资产库
        </el-button>
      </div>
    </el-form>

    <!-- 入库参数配置弹窗 -->
    <el-dialog 
      v-model="saveDialogVisible" 
      title="固化当前分段至数字资产库" 
      width="440px" 
      destroy-on-close
      @open="fetchProjectGroupsForSave"
    >
      <el-form :model="saveForm" label-width="110px" size="default">
        <el-form-item label="归属工程组">
          <el-select 
            v-model="saveForm.groupId" 
            placeholder="选择归属工程组或新建" 
            style="width: 100%"
            @change="handleGroupChange"
          >
            <el-option label="✨ 新建独立工程组" :value="0" />
            <el-option 
              v-for="grp in projectGroupList" 
              :key="grp.id" 
              :label="`${grp.group_name} (${grp.tunnel_type} · ${grp.segment_count}段)`" 
              :value="grp.id" 
            />
          </el-select>
        </el-form-item>

        <el-form-item label="新建组名" v-if="saveForm.groupId === 0" required>
          <el-input v-model="saveForm.newGroupName" placeholder="如: 晏家隧道工程" />
        </el-form-item>

        <el-form-item label="分段工程命名" required>
          <el-input v-model="saveForm.projectName" placeholder="如: 晏家隧道_K0+000~K0+047" />
        </el-form-item>

        <el-form-item label="工程分类" required>
          <el-select 
            v-model="saveForm.tunnelClass" 
            placeholder="选择隧道交通属性" 
            style="width: 100%"
            :disabled="saveForm.groupId !== 0"
          >
            <el-option label="公路" value="公路" />
            <el-option label="铁路" value="铁路" />
            <el-option label="城市道路" value="城市道路" />
            <el-option label="城市轨道" value="城市轨道" />
            <el-option label="水工" value="水工" />
            <el-option label="综合管廊" value="综合管廊" />
            <el-option label="其他" value="其他" />
          </el-select>
          <span v-if="saveForm.groupId !== 0" class="cascade-lock-tip">
            🔒 继承自所选工程组分类，不可单独修改
          </span>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useParameterStore } from '@/store/parameterStore';
import { useAuthStore } from '@/store/authStore';
import { ElMessage } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { Fold, Expand } from '@element-plus/icons-vue';
import apiClient from '@/api/index'; // 使用已封装好端口与拦截器的 Axios 实例

const paramStore = useParameterStore();
const authStore = useAuthStore();
const formRef = ref<FormInstance>();
const formContainerRef = ref<HTMLElement | null>(null);

// 容器宽度响应式状态（默认标准宽度 550px）
const containerWidth = ref(550);
let resizeObserver: ResizeObserver | null = null;

// 主折叠面板状态（默认展开 3 大专业大类）
const activeNames = ref(['1', '2', '3']);

// 二级高级参数折叠卡片状态（默认全部闭合，聚焦主干参数）
const hydroSubActive = ref<string[]>([]);
const structSubActive = ref<string[]>([]);
const drainSubActive = ref<string[]>([]);

// 宽度感知自适应计算属性
const formLabelPosition = computed<'right' | 'top'>(() => {
  return containerWidth.value < 420 ? 'top' : 'right';
});

const formLabelWidth = computed(() => {
  if (containerWidth.value < 420) return 'auto';
  if (containerWidth.value < 520) return '115px';
  return '130px';
});

const colSpan = computed(() => {
  return containerWidth.value < 520 ? 24 : 12;
});

const gridGutter = computed(() => {
  return containerWidth.value < 520 ? 12 : 20;
});

// 主折叠面板一键收起/展开控制
const isAllCollapsed = computed(() => activeNames.value.length === 0);

const toggleAllCollapses = () => {
  if (isAllCollapsed.value) {
    if (containerWidth.value < 420) {
      activeNames.value = ['1']; // 极窄态展开首个主类聚焦
    } else {
      activeNames.value = ['1', '2', '3'];
    }
  } else {
    activeNames.value = [];
  }
};

// 极窄态受控单类聚焦（保持 string[] 数组类型，规避 accordion 动态属性类型冲突）
const handleMainCollapseChange = (val: string[]) => {
  if (containerWidth.value < 420 && val.length > 1) {
    activeNames.value = [val[val.length - 1]];
  } else {
    activeNames.value = val;
  }
};

onMounted(() => {
  if (formContainerRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          const prevWidth = containerWidth.value;
          containerWidth.value = width;
          // 跨越断点进入极窄态（< 420px）时自动收拢高级折叠与非活跃主类
          if (prevWidth >= 420 && width < 420) {
            hydroSubActive.value = [];
            structSubActive.value = [];
            drainSubActive.value = [];
            if (activeNames.value.length > 1) {
              activeNames.value = [activeNames.value[0] || '1'];
            }
          }
        }
      }
    });
    resizeObserver.observe(formContainerRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
});

// 表单可编辑性计算：仅在免密模式或表单软锁已激活时允许编辑，与全局会话凭据解耦以支持回锁防误触
const isFormEditable = computed(() => {
  return !authStore.authRequired || authStore.authMode === 'disabled' || authStore.isFormUnlocked;
});

const handleUnlockClick = () => {
  authStore.requestFormUnlock();
};

const handleOpenSaveDialog = () => {
  authStore.wrapActionWithAuth(() => {
    saveDialogVisible.value = true;
  }, '单段参数入库');
};

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

// 自定义几何半径级联校验规则：r_0 < r_s < r_p <= r_g
const validateRadius = (rule: any, value: any, callback: any) => {
  const { r_0, r_s, r_p, r_g } = formData.value;
  if (r_0 >= r_s) {
    callback(new Error('二衬内半径 r_0 必须小于二衬外半径 r_s'));
  } else if (r_s >= r_p) {
    callback(new Error('二衬外半径 r_s 必须小于初支外半径 r_p'));
  } else if (r_p > r_g) {
    callback(new Error('初支外半径 r_p 不能大于注浆圈外半径 r_g'));
  } else {
    callback();
  }
};

// 自定义地下水头与中心埋深校验：H <= h_1
const validateWaterHead = (rule: any, value: any, callback: any) => {
  const depthVal = formData.value.h_1;
  if (formData.value.H > depthVal) {
    callback(new Error('初始地下水头 H 不宜超过隧道中心埋深 h_1'));
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
  r_0: [{ validator: validateRadius, trigger: 'change' }],
  r_s: [{ validator: validateRadius, trigger: 'change' }],
  r_p: [{ validator: validateRadius, trigger: 'change' }],
  r_g: [{ validator: validateRadius, trigger: 'change' }],
  H: [{ validator: validateWaterHead, trigger: 'change' }]
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
const projectGroupList = ref<any[]>([]);

const saveForm = ref({
  groupId: 0,
  newGroupName: '',
  projectName: '',
  tunnelClass: '公路'
});

// 打开弹窗时拉取最新工程组列表
const fetchProjectGroupsForSave = async () => {
  try {
    const res: any = await apiClient.get('/database/projects', { params: { all: true } });
    projectGroupList.value = Array.isArray(res) ? res : (res?.items || []);
    if (projectGroupList.value.length > 0) {

      saveForm.value.groupId = projectGroupList.value[0].id;
      saveForm.value.tunnelClass = projectGroupList.value[0].tunnel_type;
    } else {
      saveForm.value.groupId = 0;
      saveForm.value.tunnelClass = '公路';
    }
  } catch (e) {
    projectGroupList.value = [];
  }
};

// 级联锁定响应：选择已有工程组自动锁定分类，选择新建组时解锁
const handleGroupChange = (val: number) => {
  if (val === 0) {
    // 新建组，保持或自选
  } else {
    const matched = projectGroupList.value.find(g => g.id === val);
    if (matched) {
      saveForm.value.tunnelClass = matched.tunnel_type;
    }
  }
};

const submitToDatabase = async () => {
  if (!saveForm.value.projectName.trim()) {
    ElMessage.warning('分段工程命名不能为空');
    return;
  }
  if (saveForm.value.groupId === 0 && !saveForm.value.newGroupName.trim()) {
    ElMessage.warning('请输入新建工程组名称');
    return;
  }

  isSaving.value = true;
  try {
    let targetGroupId = saveForm.value.groupId;

    // 若是新建工程组，通过 batch 创建或单段指定组
    if (targetGroupId === 0) {
      // 批量创建单个工程组
      const batchRes: any = await apiClient.post('/database/parameters/batch', {
        group_name: saveForm.value.newGroupName.trim(),
        engineering_category: saveForm.value.tunnelClass,
        description: '单段入库创建的工程组',
        naming_pattern: 'standard_station',
        conflict_mode: 'append',
        segments: [{
          remark: saveForm.value.projectName.trim(),
          start_chainage: formData.value.start_chainage,
          end_chainage: formData.value.end_chainage,
          parameters_json: paramStore.currentPayload,
          results_json: paramStore.currentResults || null
        }]
      });
      ElMessage.success(`已创建工程组 [${saveForm.value.newGroupName}] 并固化分段参数`);
      saveDialogVisible.value = false;
      saveForm.value.projectName = '';
      saveForm.value.newGroupName = '';
      return;
    }

    const payload = {
      group_id: targetGroupId,
      project_name: saveForm.value.projectName.trim(),
      engineering_category: saveForm.value.tunnelClass,
      tunnel_type: saveForm.value.tunnelClass,
      parameters_json: paramStore.currentPayload,
      results_json: paramStore.currentResults || null
    };

    await apiClient.post('/database/parameters', payload);
    
    ElMessage.success(`分段参数已成功固化至工程数据库`);
    saveDialogVisible.value = false;
    saveForm.value.projectName = '';
  } catch (error: any) {
    const detail = error.response?.data?.detail || error.message || '未知错误';
    ElMessage.error('入库失败: ' + detail);
  } finally {
    isSaving.value = false;
  }
};
</script>

<style scoped>
.form-container {
  padding-bottom: 20px;
}

/* 顶部状态与软锁指示条 */
.form-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: var(--el-fill-color-light, #f8fafc);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  border-radius: 6px;
}

.form-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-title-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #1e293b);
}

.param-count-badge {
  font-size: 12px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.form-lock-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collapse-toggle-btn {
  font-size: 13px !important;
  color: var(--el-text-color-regular, #64748b);
  border-color: var(--el-border-color, #e2e8f0);
}

.collapse-toggle-btn:hover {
  color: var(--el-color-primary, #3b82f6);
  border-color: var(--el-color-primary, #3b82f6);
}

.unlock-form-btn {
  font-size: 12px !important;
  font-weight: 500;
}

.unlocked-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.unlocked-badge {
  font-size: 12px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.relock-btn {
  font-size: 12px !important;
  color: #94a3b8 !important;
  padding: 0 4px !important;
}

.relock-btn:hover {
  color: #dc2626 !important;
  text-decoration: underline;
}

/* 嵌套二级折叠面板卡片化设计 */
.nested-sub-collapse {
  margin-top: 12px;
  margin-bottom: 6px;
  padding: 4px 10px;
  background: var(--el-fill-color-lighter, rgba(0, 0, 0, 0.02));
  border: 1px solid var(--el-border-color-lighter, #f1f5f9);
  border-radius: 6px;
}

.nested-sub-collapse :deep(.el-collapse) {
  border-top: none;
  border-bottom: none;
}

.nested-sub-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #64748b);
  background: transparent;
  height: 36px;
  line-height: 36px;
  border-bottom: 1px dashed var(--el-border-color-lighter, #e2e8f0);
}

.nested-sub-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border-bottom: none;
  padding-top: 10px;
}

.nested-sub-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 4px;
}

/* 极窄模式空间紧凑优化与防止横向溢出 */
.is-narrow-mode :deep(.el-form-item) {
  margin-bottom: 10px;
}

.is-narrow-mode :deep(.el-form-item__label) {
  font-size: 12px;
  line-height: 18px;
  padding-bottom: 4px;
}

.is-narrow-mode :deep(.el-input-number) {
  width: 100% !important;
}

.is-narrow-mode :deep(.el-select) {
  width: 100% !important;
}

.form-actions {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  border-top: 1px dashed var(--sys-border, #e2e8f0);
  padding-top: 15px;
}

.cascade-lock-tip {
  font-size: 12px;
  color: var(--el-color-info);
  margin-top: 4px;
  display: block;
  line-height: 1.4;
}

/* 主筋材料级别只读标签：适配科技蓝主题质感与行高对齐 */
.rebar-grade-tag {
  font-size: 12px !important;
  font-weight: 600;
  letter-spacing: 0.5px;
  height: 24px;
  line-height: 22px;
  padding: 0 10px;
  border-radius: 4px;
  background-color: var(--el-fill-color-light, #f1f5f9);
  border: 1px solid var(--el-border-color, #cbd5e1);
  color: var(--el-text-color-regular, #475569);
  transition: all 0.2s ease;
}

:global(.theme-tech-blue) .rebar-grade-tag {
  background-color: rgba(20, 36, 59, 0.75) !important;
  border-color: #2c5282 !important;
  color: #90cdf4 !important;
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.15);
}

:global(.theme-tech-blue) .rebar-grade-tag:hover {
  border-color: #3b82f6 !important;
  color: #bfdbfe !important;
}
</style>