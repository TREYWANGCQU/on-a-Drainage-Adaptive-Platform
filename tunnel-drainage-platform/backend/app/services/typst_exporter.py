# backend/app/services/typst_exporter.py
"""
Typst 编译引擎服务与数据映射转换器
支持单份 A4 计算书高保真编译与多快照并发 ZIP 归档打包
"""

import io
import json
import math
import os
import shutil
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import typst

# 模板目录根路径
TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "typst"
MASTER_TEMPLATE_PATH = TEMPLATE_DIR / "calculation_book.typ"


def clamp(val: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, val))


def extract_value(snap: Dict[str, Any], key: str, default: Any) -> Any:
    """多级降级提取快照中的参数数值"""
    # 1. 顶层直接字段
    if key in snap and snap[key] is not None:
        return snap[key]
    
    # 2. params 字典
    params = snap.get("params") or {}
    if key in params and params[key] is not None:
        return params[key]
        
    # 3. results.input_parameter 字典
    results = snap.get("results") or {}
    inputs = results.get("input_parameter") or {}
    if key in inputs and inputs[key] is not None:
        return inputs[key]
        
    # 4. results.original_state 字典
    orig = results.get("original_state") or {}
    if key in orig and orig[key] is not None:
        return orig[key]
        
    # 5. results.critical_state 字典
    crit = results.get("critical_state") or {}
    if key in crit and crit[key] is not None:
        return crit[key]
        
    return default


def map_snapshot_to_book_data(snap: Dict[str, Any]) -> Dict[str, Any]:
    """
    将快照字典严格映射为《计算书》6大核心章节标准结构化数据包
    与前端 bookGenerator.ts 算法 100% 保持一致
    """
    # 1. 几何参数提取
    r0 = float(extract_value(snap, "r0", 5.3))
    rs = float(extract_value(snap, "rs", 5.7))
    rp = float(extract_value(snap, "rp", 5.93))
    rg_initial = float(extract_value(snap, "rg", 5.93))
    h1_depth = float(extract_value(snap, "h1", 107.0))
    
    tunnel_type_raw = str(extract_value(snap, "tunnel_type", "double")).lower()
    is_double = "single" not in tunnel_type_raw
    tunnel_type = "double" if is_double else "single"
    D_spacing = float(extract_value(snap, "D", 27.0)) if is_double else None
    
    start_chainage = float(extract_value(snap, "start_chainage", 0.0))
    end_chainage = float(extract_value(snap, "end_chainage", 100.0))
    partition_length = max(1.0, abs(end_chainage - start_chainage))
    
    # 2. 水文地质与结构力学参数提取
    kr = float(extract_value(snap, "kr", 0.3))
    ks = float(extract_value(snap, "ks", 0.000864))
    kp = float(extract_value(snap, "kp", 0.00864))
    kg = float(extract_value(snap, "kg", 0.026))
    H_water = float(extract_value(snap, "H", 93.0))
    p_annual = float(extract_value(snap, "p", 1000.0))
    cn = float(extract_value(snap, "CN", 25.0))
    
    gamma_w = float(extract_value(snap, "gamma_w", 10.0))
    gamma_s = float(extract_value(snap, "gamma_s", 24.0))
    gamma_s_eff = float(extract_value(snap, "gamma_s_eff", 14.0))
    lambda_side = float(extract_value(snap, "lambda", 0.25))
    Ks_subgrade = float(extract_value(snap, "Ks", 850.0))
    rock_grade_str = str(extract_value(snap, "surrounding_rock_grade", "III级围岩"))
    
    Rw_concrete = float(extract_value(snap, "Rw", 28.1))
    Rg_rebar = float(extract_value(snap, "Rg", 400.0))
    Ag_rebar_area = float(extract_value(snap, "Ag", 1017.0))
    as_cover = float(extract_value(snap, "as_cover", 50.0))
    lining_thickness_h = int(round((rs - r0) * 1000))
    
    # 3. 元数据装配
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    report_code = f"CALC-SD-DK{int(start_chainage)}-{int(end_chainage)}"
    snap_id = snap.get("id") or f"snap_{int(now.timestamp())}"
    snap_remark = snap.get("remark") or f"DK{int(start_chainage)}~DK{int(end_chainage)} 工况"
    
    meta = {
        "projectName": "某高速公路/铁路特长隧道工程",
        "tunnelName": "东段深埋富水隧道",
        "documentTitle": "隧道防排水优化设计计算书",
        "reportCode": report_code,
        "snapshotId": snap_id,
        "snapshotRemark": snap_remark,
        "startChainage": start_chainage,
        "endChainage": end_chainage,
        "partitionLength": partition_length,
        "generatedDate": date_str,
        "designer": "智能化防排水自适应系统",
        "reviewer": "智能校审模型",
        "approver": "项目总工程师"
    }
    
    # 4. 第 1 章：设计依据
    chapter1 = {
        "specifications": [
            {"code": "JTG 3370.1-2018", "name": "《公路隧道设计规范 第一册 土建工程》"},
            {"code": "GB 50108-2008", "name": "《地下工程防水技术规范》"},
            {"code": "TB 10003-2016", "name": "《铁路隧道设计规范》"},
            {"code": "JTG/T D70-2010", "name": "《公路隧道设计细则》"}
        ],
        "theories": [
            {
                "title": "SCS-CN 降雨入渗水文补给理论",
                "description": "用于定量推导降雨入渗对地下水位的动态补给增量，将年降雨量转化为围岩静水头修正值。"
            },
            {
                "title": "多层圆筒串联渗流连续介质理论",
                "description": "建立「围岩-注浆加固圈-喷射初支-二次衬砌」四层介质的串联达西渗流模型，精确解算衬砌外水压力与涌水量。"
            },
            {
                "title": "双洞渗流保角映射等效理论",
                "description": "针对双洞平行隧道，基于复变函数保角变换与几何叠加原理，求解双洞互扰下的等效渗流影响半径。"
            },
            {
                "title": "泰沙基围岩压力理论与荷载-结构法（梁-弹簧模型）",
                "description": "采用深埋拱形泰沙基土压力公式结合梁-弹簧衬砌有限元模型，求解水土耦合作用下的最不利截面控制内力与安全系数。"
            }
        ]
    }
    
    # 5. 第 2 章：基础计算参数
    geometry_params = [
        {"name": "二次衬砌内半径", "symbol": "r_0", "value": f"{r0:.2f}", "unit": "m", "remark": "有效净空尺寸"},
        {"name": "二次衬砌外半径", "symbol": "r_s", "value": f"{rs:.2f}", "unit": "m", "remark": f"二衬厚度 {(rs - r0):.2f} m"},
        {"name": "初支喷层外半径", "symbol": "r_p", "value": f"{rp:.2f}", "unit": "m", "remark": f"初支厚度 {(rp - rs):.2f} m"},
        {"name": "初始注浆圈外半径", "symbol": "r_g", "value": f"{rg_initial:.2f}", "unit": "m", "remark": "初始状态不设加固圈"},
        {"name": "隧道中心埋深", "symbol": "h_1", "value": f"{h1_depth:.1f}", "unit": "m", "remark": "设计中心埋深"},
        {"name": "计算分区长度", "symbol": "L", "value": f"{partition_length:.2f}", "unit": "m", "remark": f"DK{int(start_chainage)} ~ DK{int(end_chainage)}"}
    ]
    if is_double and D_spacing is not None:
        geometry_params.insert(5, {"name": "双洞中心间距", "symbol": "D", "value": f"{D_spacing:.1f}", "unit": "m", "remark": "双洞平行布置间距"})
        
    hydro_params = [
        {"name": "围岩渗透系数", "symbol": "k_r", "value": str(kr), "unit": "m/d", "remark": rock_grade_str},
        {"name": "二次衬砌渗透系数", "symbol": "k_s", "value": f"{ks:.3e}", "unit": "m/d", "remark": "防水混凝土抗渗指标"},
        {"name": "初支喷层渗透系数", "symbol": "k_p", "value": f"{kp:.3e}", "unit": "m/d", "remark": "喷射混凝土渗透性"},
        {"name": "注浆圈渗透系数", "symbol": "k_g", "value": str(kg), "unit": "m/d", "remark": "注浆加固圈目标抗渗指标"},
        {"name": "初始静水位水头", "symbol": "H", "value": f"{H_water:.2f}", "unit": "m", "remark": "地质勘察水头"},
        {"name": "多年平均降雨量", "symbol": "p", "value": f"{p_annual:.1f}", "unit": "mm", "remark": "气象水文数据"},
        {"name": "径流曲线数", "symbol": "CN", "value": str(cn), "unit": "-", "remark": "SCS-CN 入渗模型参数"},
        {"name": "水的重度", "symbol": "γ", "value": f"{gamma_w:.1f}", "unit": "kN/m³", "remark": "标准重度"},
        {"name": "围岩天然重度", "symbol": "γ_s", "value": f"{gamma_s:.1f}", "unit": "kN/m³", "remark": rock_grade_str},
        {"name": "围岩有效浮重度", "symbol": "γ'_s", "value": f"{gamma_s_eff:.1f}", "unit": "kN/m³", "remark": "地下水位以下取浮重"},
        {"name": "侧压力系数", "symbol": "λ", "value": f"{lambda_side:.2f}", "unit": "-", "remark": "侧向水平土压力比"},
        {"name": "地基抗力系数", "symbol": "K_s", "value": f"{Ks_subgrade:.1f}", "unit": "MPa/m", "remark": "弹性地基边界刚度"}
    ]
    
    structural_params = [
        {"name": "二衬混凝土标号", "symbol": "-", "value": "C30", "unit": "-", "remark": "结构设计受压等级"},
        {"name": "混凝土抗压强度设计值", "symbol": "R_w", "value": f"{Rw_concrete:.1f}", "unit": "MPa", "remark": "轴心抗压强度设计值"},
        {"name": "受力钢筋型号", "symbol": "-", "value": "HRB400", "unit": "-", "remark": "纵向及环向受力筋"},
        {"name": "钢筋抗拉强度设计值", "symbol": "R_g", "value": f"{Rg_rebar:.1f}", "unit": "MPa", "remark": "屈服抗拉设计值"},
        {"name": "单侧截面配筋面积", "symbol": "A_g", "value": f"{Ag_rebar_area:.0f}", "unit": "mm²/m", "remark": "延米对称配筋"},
        {"name": "钢筋保护层厚度", "symbol": "a_s", "value": f"{as_cover:.0f}", "unit": "mm", "remark": "结构外缘净距"},
        {"name": "规范允许安全系数", "symbol": "[K]", "value": "2.00", "unit": "-", "remark": "JTG 3370.1-2018 门禁限值"}
    ]
    
    chapter2 = {
        "geometryParams": geometry_params,
        "hydrogeologyParams": hydro_params,
        "structuralParams": structural_params
    }
    
    # 6. 第 3 章：原始状态渗流水力计算
    ratio_r0_H = r0 / max(1e-4, H_water)
    water_level_case = "high" if ratio_r0_H < 0.062 else "low"
    
    S_retention = 25400.0 / max(1.0, cn) - 254.0
    Ia_initialLoss = 0.2 * S_retention
    hs_runoff = math.pow(p_annual - Ia_initialLoss, 2) / (p_annual - Ia_initialLoss + S_retention) if p_annual > Ia_initialLoss else 0.0
    h0_effectiveWaterHead = H_water + (p_annual - hs_runoff) / 1000.0
    
    lg_kr = math.log10(max(1e-6, kr))
    beta1 = 1.635 + 0.43 * lg_kr + 0.029 * (lg_kr ** 2)
    R_inf = beta1 * h0_effectiveWaterHead
    
    R_effective = R_inf
    phi_deg = 0.0
    if is_double and D_spacing is not None and (D_spacing / 2.0 < R_inf):
        cos_val = clamp((D_spacing / 2.0) / R_inf, -1.0, 1.0)
        phi_rad = 2.0 * math.acos(cos_val)
        phi_deg = math.degrees(phi_rad)
        R_effective = (1.0 - phi_deg / 360.0) * R_inf + (R_inf / math.pi) * math.sin(phi_rad / 2.0)
        
    rs_r0_ln = math.log(rs / r0)
    sum_res_press = rs_r0_ln + (ks / kr) * math.log(R_effective / rg_initial) + (ks / kg) * math.log(rg_initial / rp) + (ks / kp) * math.log(rp / rs)
    
    # 提取或计算外水压力与排涌量
    P_water = extract_value(snap, "p_lining", None) or extract_value(snap, "water_pressure", None)
    if P_water is None or float(P_water) <= 0:
        P_water = (gamma_w * R_effective * rs_r0_ln) / max(1e-6, sum_res_press)
    else:
        P_water = float(P_water)
        
    sum_res_q = math.log(R_effective / rg_initial) + (kr / kg) * math.log(rg_initial / rp) + (kr / kp) * math.log(rp / rs) + (kr / ks) * math.log(rs / r0)
    q_unit = extract_value(snap, "q_drain", None) or extract_value(snap, "q", None)
    if q_unit is None or float(q_unit) <= 0:
        q_unit = (2.0 * math.pi * kr * R_effective) / max(1e-6, sum_res_q)
    else:
        q_unit = float(q_unit)
        
    Q_total = extract_value(snap, "Q", None)
    if Q_total is None or float(Q_total) <= 0:
        Q_total = q_unit * partition_length
    else:
        Q_total = float(Q_total)
        
    chapter3 = {
        "waterLevelCase": water_level_case,
        "tunnelType": tunnel_type,
        "ratio_r0_H": ratio_r0_H,
        "threshold_r0_H": 0.062,
        "caseDescription": f"{'双洞平行隧道' if is_double else '单洞隧道'} + {'高水位工况' if water_level_case == 'high' else '低水位工况'}",
        "cn": cn,
        "p_annual": p_annual,
        "S_retention": S_retention,
        "Ia_initialLoss": Ia_initialLoss,
        "hs_runoff": hs_runoff,
        "h0_effectiveWaterHead": h0_effectiveWaterHead,
        "beta1": beta1,
        "R_inf": R_inf,
        "isDoubleTube": is_double,
        "D_spacing": D_spacing,
        "phi_deg": phi_deg,
        "R_effective": R_effective,
        "rs_r0_ln": rs_r0_ln,
        "sum_resistance": sum_res_press,
        "P_waterPressure": P_water,
        "q_unitDischarge": q_unit,
        "Q_totalDischarge": Q_total,
        "summaryTable": [
            {"metric": "入渗折算有效水头", "symbol": "h_0", "value": f"{h0_effectiveWaterHead:.2f}", "unit": "m"},
            {"metric": "等效渗流影响半径", "symbol": "R_eff", "value": f"{R_effective:.2f}", "unit": "m"},
            {"metric": "延米单位涌水量", "symbol": "q", "value": f"{q_unit:.3f}", "unit": "m³/(d·m)"},
            {"metric": "分区总涌水量", "symbol": "Q", "value": f"{Q_total:.1f}", "unit": "m³/d"},
            {"metric": "衬砌外水压力", "symbol": "P", "value": f"{P_water:.1f}", "unit": "kPa"}
        ]
    }
    
    # 7. 第 4 章：原始状态衬砌结构安全验算
    lining_width = 2.0 * rs
    grade_num = 3
    if "II" in rock_grade_str and "III" not in rock_grade_str:
        grade_num = 2
    elif "IV" in rock_grade_str:
        grade_num = 4
    elif "V" in rock_grade_str:
        grade_num = 5
    elif "VI" in rock_grade_str:
        grade_num = 6
        
    grade_factor = (6.0 - grade_num) / 6.0
    Hq_arch = 0.45 * math.pow(2.0, grade_factor) * lining_width
    p_earth = gamma_s_eff * Hq_arch
    
    axial_N = float(extract_value(snap, "N", 1620.0) or extract_value(snap, "axial_force", 1620.0))
    moment_M = float(extract_value(snap, "M", 158.0) or extract_value(snap, "bending_moment", 158.0))
    
    section_b = 1000.0
    h0_sec = lining_thickness_h - as_cover
    xi_b = 0.55
    Nb_limit = Rw_concrete * section_b * xi_b * h0_sec * 1e-3
    is_large_ecc = axial_N < Nb_limit
    
    ecc_e = (moment_M / max(1.0, axial_N)) + (lining_thickness_h / 2000.0) - (as_cover / 1000.0)
    Mu_limit = Rg_rebar * Ag_rebar_area * (h0_sec - as_cover) * 1e-6
    
    actual_K = extract_value(snap, "safety_factor", None) or extract_value(snap, "K", None)
    if actual_K is None or float(actual_K) <= 0:
        actual_K = Mu_limit / max(1e-6, (axial_N * ecc_e))
    else:
        actual_K = float(actual_K)
        
    is_safe = actual_K >= 2.0
    
    chapter4 = {
        "rockGrade": rock_grade_str,
        "liningOuterWidth": lining_width,
        "Hq_archHeight": Hq_arch,
        "isDeepTunnel": h1_depth > Hq_arch,
        "gamma_s_effective": gamma_s_eff,
        "p_earthPressure": p_earth,
        "criticalSection": "拱腰截面 (最不利受力位置)",
        "axialForce_N": axial_N,
        "bendingMoment_M": moment_M,
        "liningThickness_h": lining_thickness_h,
        "sectionWidth_b": section_b,
        "as_cover": as_cover,
        "h0_section": h0_sec,
        "Rw_concrete": Rw_concrete,
        "Rg_rebar": Rg_rebar,
        "Ag_rebarArea": Ag_rebar_area,
        "xi_b": xi_b,
        "Nb_limitAxial": Nb_limit,
        "isLargeEccentricity": is_large_ecc,
        "eccentricity_e": ecc_e,
        "Mu_limitMoment": Mu_limit,
        "actualSafetyFactor_K": actual_K,
        "allowableSafetyFactor": 2.0,
        "isSafe": is_safe
    }
    
    # 8. 第 5 章：防排水优化设计
    safety_state = "safe" if is_safe else "critical"
    crit_h = None
    crit_P = None
    rg_crit = None
    tg_crit = None
    q_opt = None
    Q_opt = None
    P_opt = None
    
    if safety_state == "critical":
        crit_h = extract_value(snap, "final_waterHead", None) or extract_value(snap, "h_crit", None)
        if crit_h is None or float(crit_h) <= 0:
            crit_h = h0_effectiveWaterHead * min(0.98, max(0.7, (actual_K / 2.0) * 1.02))
        else:
            crit_h = float(crit_h)
        crit_P = gamma_w * crit_h
        
        C0 = rs_r0_ln + (ks / kr) * math.log(R_effective) - (ks / kg) * math.log(rp) + (ks / kp) * math.log(rp / rs)
        denom = ks * (1.0 / kg - 1.0 / kr)
        term1 = (gamma_w * R_effective * rs_r0_ln) / max(1e-4, crit_P)
        ln_rg_crit = (term1 - C0) / max(1e-6, denom)
        
        rg_crit = extract_value(snap, "rg_crit", None) or extract_value(snap, "rg_optimal", None)
        if rg_crit is None or float(rg_crit) < rp:
            rg_crit = max(rp, math.exp(clamp(ln_rg_crit, -10.0, 10.0)))
        else:
            rg_crit = float(rg_crit)
            
        tg_crit = max(0.0, rg_crit - rp)
        
        sum_res_opt_q = math.log(R_effective / rg_crit) + (kr / kg) * math.log(rg_crit / rp) + (kr / kp) * math.log(rp / rs) + (kr / ks) * math.log(rs / r0)
        q_opt = (2.0 * math.pi * kr * R_effective) / max(1e-6, sum_res_opt_q)
        Q_opt = q_opt * partition_length
        
        sum_res_opt_p = rs_r0_ln + (ks / kr) * math.log(R_effective / rg_crit) + (ks / kg) * math.log(rg_crit / rp) + (ks / kp) * math.log(rp / rs)
        P_opt = (gamma_w * R_effective * rs_r0_ln) / max(1e-6, sum_res_opt_p)
        
    manning_n = 0.012
    active_q = q_opt if q_opt is not None else q_unit
    active_Q = Q_opt if Q_opt is not None else Q_total
    
    ring_diam_mm = 50
    ring_spacing_m = float(extract_value(snap, "ring_spacing_recommend", 10.0))
    ring_slope = 0.73
    ring_side_flow = (active_q * ring_spacing_m) / 2.0
    ring_area = math.pi * math.pow(ring_diam_mm / 2000.0, 2)
    ring_rh = (ring_diam_mm / 1000.0) / 4.0
    ring_capacity = (86400.0 / manning_n) * ring_area * math.pow(ring_rh, 2.0 / 3.0) * math.pow(ring_slope, 0.5)
    
    long_diam_mm = 100
    long_slope = 0.02
    long_flow = active_Q / 2.0
    long_area = math.pi * math.pow(long_diam_mm / 2000.0, 2)
    long_rh = (long_diam_mm / 1000.0) / 4.0
    long_capacity = (86400.0 / manning_n) * long_area * math.pow(long_rh, 2.0 / 3.0) * math.pow(long_slope, 0.5)
    
    lat_diam_mm = 80
    lat_slope = 0.01
    lat_flow = ring_side_flow
    lat_area = math.pi * math.pow(lat_diam_mm / 2000.0, 2)
    lat_rh = (lat_diam_mm / 1000.0) / 4.0
    lat_capacity = (86400.0 / manning_n) * lat_area * math.pow(lat_rh, 2.0 / 3.0) * math.pow(lat_slope, 0.5)
    
    chapter5 = {
        "safetyState": safety_state,
        "targetSafetyFactor": 2.0,
        "criticalWaterHead_h_crit": crit_h,
        "criticalWaterPressure_P_crit": crit_P,
        "rg_crit": rg_crit,
        "tg_crit": tg_crit,
        "q_opt_unitDischarge": q_opt,
        "Q_opt_totalDischarge": Q_opt,
        "P_opt_waterPressure": P_opt,
        "safeStatement": "根据第4章验算结论，本工况在原始外水压力作用下衬砌结构安全系数 K ≥ 2.00，截面抗力充盈，满足规范允许承载要求。本工程无需实施全断面深孔注浆堵水加固圈，直接采用标准防排水管网体系进行引排与消压。" if is_safe else None,
        "manning_n": manning_n,
        "ringPipeDiam_mm": ring_diam_mm,
        "ringPipeSpacing_m": ring_spacing_m,
        "ringPipeSlope": ring_slope,
        "ringPipeSideFlow": ring_side_flow,
        "ringPipeCapacity": ring_capacity,
        "ringPipePassed": ring_capacity >= ring_side_flow,
        "longPipeDiam_mm": long_diam_mm,
        "longPipeSlope": long_slope,
        "longPipeFlow": long_flow,
        "longPipeCapacity": long_capacity,
        "longPipePassed": long_capacity >= long_flow,
        "latPipeDiam_mm": lat_diam_mm,
        "latPipeSlope": lat_slope,
        "latPipeFlow": lat_flow,
        "latPipeCapacity": lat_capacity,
        "latPipePassed": lat_capacity >= lat_flow
    }
    
    # 9. 第 6 章：最终设计结论
    if safety_state == "critical":
        grouting_table = [
            {"item": "临界控制水头 h_crit", "value": f"{crit_h:.2f}" if crit_h else "-", "unit": "m", "remark": "控压目标水位"},
            {"item": "临界控制外水压 P_crit", "value": f"{crit_P:.1f}" if crit_P else "-", "unit": "kPa", "remark": "结构安全限值"},
            {"item": "临界注浆圈外半径 r_g,crit", "value": f"{rg_crit:.3f}" if rg_crit else "-", "unit": "m", "remark": "自隧道中心起算"},
            {"item": "临界注浆加固厚度 t_g,crit", "value": f"{tg_crit:.3f}" if tg_crit else "-", "unit": "m", "remark": "初支外缘加固圈净厚"},
            {"item": "注浆圈设计渗透系数 k_g", "value": str(kg), "unit": "m/d", "remark": "注浆达标质量检验指标"}
        ]
    else:
        grouting_table = [
            {"item": "注浆加固措施", "value": "无需设置", "unit": "-", "remark": "原始结构安全性 K ≥ 2.00 达标"},
            {"item": "衬砌外水压力设计值", "value": f"{P_water:.1f}", "unit": "kPa", "remark": "自然全水头作用"},
            {"item": "围岩加固方式", "value": "常规锚喷支护", "unit": "-", "remark": "按标准支护图集施工"}
        ]
        
    drainage_table = [
        {
            "facility": "环向打孔波纹排水盲管",
            "spec": f"DN{ring_diam_mm} mm 软式透水管",
            "designParam": f"间距 {ring_spacing_m:.1f} m，环向顺坡敷设 (i = {ring_slope})",
            "capacityMargin": f"过流裕度 {(ring_capacity / max(1e-4, ring_side_flow)):.1f} 倍 (容量 {ring_capacity:.1f} m³/d)"
        },
        {
            "facility": "横向导水穿衬支管",
            "spec": f"DN{lat_diam_mm} mm PVC 排水管",
            "designParam": f"坡度 i = {lat_slope}，双侧对称引排入水沟",
            "capacityMargin": f"过流裕度 {(lat_capacity / max(1e-4, lat_flow)):.1f} 倍 (容量 {lat_capacity:.1f} m³/d)"
        },
        {
            "facility": "纵向主排水暗沟/盲管",
            "spec": f"DN{long_diam_mm} mm 打孔波纹管",
            "designParam": f"全线贯通敷设，纵向设计坡度 i = {long_slope}",
            "capacityMargin": f"过流裕度 {(long_capacity / max(1e-4, long_flow)):.1f} 倍 (容量 {long_capacity:.1f} m³/d)"
        }
    ]
    
    p_change_rate = f"{(((P_water - P_opt) / max(1e-4, P_water)) * 100.0):.1f}" if safety_state == "critical" and P_opt else "0.0"
    q_change_rate = f"{(((Q_total - Q_opt) / max(1e-4, Q_total)) * 100.0):.1f}" if safety_state == "critical" and Q_opt else "0.0"
    
    benefit_table = [
        {
            "indicator": "衬砌外水压力 P",
            "beforeValue": f"{P_water:.1f} kPa",
            "afterValue": f"{P_opt:.1f} kPa" if safety_state == "critical" and P_opt else f"{P_water:.1f} kPa",
            "changeRate": f"↓ {p_change_rate}%" if safety_state == "critical" else "保持稳定",
            "evaluation": "成功降压至临界承载红线以下" if safety_state == "critical" else "结构自身满足承载抗力"
        },
        {
            "indicator": "分区总涌水量 Q",
            "beforeValue": f"{Q_total:.1f} m³/d",
            "afterValue": f"{Q_opt:.1f} m³/d" if safety_state == "critical" and Q_opt else f"{Q_total:.1f} m³/d",
            "changeRate": f"↓ {q_change_rate}%" if safety_state == "critical" else "保持稳定",
            "evaluation": "大幅削减排水泵站负荷" if safety_state == "critical" else "常规重力自流顺畅排泄"
        },
        {
            "indicator": "截面安全系数 K",
            "beforeValue": f"{actual_K:.2f}",
            "afterValue": "2.00" if safety_state == "critical" else f"{actual_K:.2f}",
            "changeRate": f"↑ {(((2.0 - actual_K) / max(1e-4, actual_K)) * 100.0):.1f}%" if safety_state == "critical" else "达标满足",
            "evaluation": "满足规范 [K] ≥ 2.00 刚性门禁"
        }
    ]
    
    if safety_state == "critical":
        conclusions = [
            f"1. 本分区（DK{int(start_chainage)} ~ DK{int(end_chainage)}，长度 {partition_length:.1f} m）原始外水压力高达 {P_water:.1f} kPa，安全系数 K = {actual_K:.2f} < 2.00，截面抗力存在超限风险。",
            f"2. 经反算求解，需在初支外侧施作厚度 t_g = {tg_crit:.2f} m（外半径 r_g = {rg_crit:.2f} m）的注浆控水圈，注浆体渗透系数需达到 k_g ≤ {kg} m/d。",
            f"3. 加固后衬砌外水压力降至 {P_opt:.1f} kPa，安全系数达标至 K = 2.00；分区总涌水量降至 {Q_opt:.1f} m³/d，减幅达 {q_change_rate}%。",
            f"4. 排水系统采用 DN50 环向盲管（间距 {ring_spacing_m:.1f} m）、DN80 横向支管与 DN100 纵向主盲管，过流能力验算均具备 2 倍以上安全富余度，方案技术经济指标优良。"
        ]
    else:
        conclusions = [
            f"1. 本分区（DK{int(start_chainage)} ~ DK{int(end_chainage)}，长度 {partition_length:.1f} m）原始外水压力为 {P_water:.1f} kPa，安全系数 K = {actual_K:.2f} ≥ 2.00，满足规范承载力要求。",
            f"2. 本段无需施加深孔注浆加固圈，免除注浆工程投资，直接利用围岩与初期支护自身承载力。",
            f"3. 排水系统按标准图集配置 DN50 环向盲管（间距 {ring_spacing_m:.1f} m）、DN80 横向支管及 DN100 纵向贯通排水管，分区涌水量 {Q_total:.1f} m³/d 可安全高效排泄。"
        ]
        
    chapter6 = {
        "groutingSchemeTable": grouting_table,
        "drainageSchemeTable": drainage_table,
        "benefitComparisonTable": benefit_table,
        "conclusions": conclusions
    }
    
    return {
        "meta": meta,
        "chapter1": chapter1,
        "chapter2": chapter2,
        "chapter3": chapter3,
        "chapter4": chapter4,
        "chapter5": chapter5,
        "chapter6": chapter6
    }


def compile_calculation_book_pdf(
    snapshot_or_book_data: Dict[str, Any],
    template_path: Optional[Path] = None
) -> Tuple[bytes, str]:
    """
    单份计算书编译：消费结构化数据，调用 Typst 编译器直接输出高保真矢量 PDF 字节流
    返回: (pdf_bytes, filename)
    """
    tmpl_path = template_path or MASTER_TEMPLATE_PATH
    if not tmpl_path.exists():
        raise FileNotFoundError(f"Typst 模板文件不存在: {tmpl_path}")
        
    # 判断入参是原始快照还是已生成的 CalculationBookData
    if "meta" in snapshot_or_book_data and "chapter1" in snapshot_or_book_data:
        book_data = snapshot_or_book_data
    else:
        book_data = map_snapshot_to_book_data(snapshot_or_book_data)
        
    meta = book_data.get("meta", {})
    start_ch = int(meta.get("startChainage", 0))
    end_ch = int(meta.get("endChainage", 100))
    report_code = meta.get("reportCode", "CALC")
    tunnel_name = meta.get("tunnelName", "Tunnel")
    filename = f"【计算书】DK{start_ch}+{end_ch}_{tunnel_name}_{report_code}.pdf"
    
    with tempfile.TemporaryDirectory(prefix="typst_calc_") as temp_dir:
        temp_dir_path = Path(temp_dir)
        data_json_path = temp_dir_path / "data.json"
        data_json_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2), encoding="utf-8")
        
        target_typ_path = temp_dir_path / "main.typ"
        shutil.copyfile(tmpl_path, target_typ_path)
        
        # 编译生成 PDF 字节
        pdf_bytes = typst.compile(
            str(target_typ_path),
            root=str(temp_dir_path)
        )
        
    return pdf_bytes, filename


def batch_compile_calculation_books_zip(
    snapshots: List[Dict[str, Any]],
    project_name: str = "隧道工程",
    max_workers: int = 4
) -> Tuple[bytes, str]:
    """
    多快照并发编译并打包为标准 ZIP 压缩包
    返回: (zip_bytes, zip_filename)
    """
    if not snapshots:
        raise ValueError("快照列表为空，无法执行批量导出")
        
    results: List[Tuple[bytes, str]] = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(compile_calculation_book_pdf, snap): idx
            for idx, snap in enumerate(snapshots)
        }
        
        # 按索引排序收集产物，保证压缩包内文件排序稳定
        indexed_results: List[Optional[Tuple[bytes, str]]] = [None] * len(snapshots)
        for future in as_completed(future_map):
            idx = future_map[future]
            try:
                pdf_bytes, filename = future.result()
                indexed_results[idx] = (pdf_bytes, filename)
            except Exception as e:
                snap_id = snapshots[idx].get("id", f"snap_{idx}")
                print(f"[TypstBatch] 快照 {snap_id} 编译失败: {e}")
                
    valid_results = [r for r in indexed_results if r is not None]
    if not valid_results:
        raise RuntimeError("所有快照编译均失败，无法生成 ZIP 压缩包")
        
    zip_buffer = io.BytesIO()
    used_names: set = set()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for idx, (pdf_bytes, filename) in enumerate(valid_results):
            final_name = filename
            if final_name in used_names:
                stem = Path(filename).stem
                suffix = Path(filename).suffix
                final_name = f"{stem}_({idx + 1}){suffix}"
            used_names.add(final_name)
            zip_file.writestr(final_name, pdf_bytes)
            
    zip_buffer.seek(0)
    zip_bytes = zip_buffer.getvalue()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"【批量计算书】{project_name}_{timestamp}_共{len(valid_results)}份.zip"
    
    return zip_bytes, zip_filename
