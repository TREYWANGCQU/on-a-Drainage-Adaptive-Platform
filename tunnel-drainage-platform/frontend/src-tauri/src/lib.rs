// frontend/src-tauri/src/lib.rs

use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Win32 Job Object 硬件级生命周期守护器
/// 当父进程崩溃、被任务管理器杀死或断电退出时，Windows 内核自动强杀挂载在 Job 中的所有子进程
#[cfg(windows)]
struct Win32JobGuard {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
unsafe impl Send for Win32JobGuard {}
#[cfg(windows)]
unsafe impl Sync for Win32JobGuard {}

#[cfg(windows)]
impl Win32JobGuard {
    fn new() -> Option<Self> {
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let res = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if res == 0 {
                windows_sys::Win32::Foundation::CloseHandle(job);
                return None;
            }

            Some(Win32JobGuard { handle: job })
        }
    }

    fn assign_child(&self, child: &Child) -> bool {
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        unsafe {
            let raw_handle = child.as_raw_handle();
            AssignProcessToJobObject(self.handle, raw_handle as _) != 0
        }
    }
}

#[cfg(windows)]
impl Drop for Win32JobGuard {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                windows_sys::Win32::Foundation::CloseHandle(self.handle);
            }
        }
    }
}

pub struct BackendState {
    pub port: u16,
    pub child: Arc<Mutex<Option<Child>>>,
}

/// 在指定范围内动态探测首个未被占用的 TCP 本地端口 (18000~18999)
fn find_available_port(start: u16, end: u16) -> u16 {
    for port in start..=end {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            drop(listener);
            return port;
        }
    }
    18000
}

/// 多级拓扑解析 Sidecar 独立可执行文件物理路径
fn resolve_sidecar_executable() -> Option<PathBuf> {
    let candidate_names = [
        "tunnel-backend-sidecar.exe",
        "tunnel-backend-sidecar-x86_64-pc-windows-msvc.exe",
        "tunnel-backend-sidecar",
    ];

    // 1. 检查当前可执行文件同级目录 (生产打包安装态)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            for name in &candidate_names {
                let p = exe_dir.join(name);
                if p.exists() {
                    return Some(p);
                }
                let res_p = exe_dir.join("resources").join("binaries").join(name);
                if res_p.exists() {
                    return Some(res_p);
                }
                let bin_p = exe_dir.join("binaries").join(name);
                if bin_p.exists() {
                    return Some(bin_p);
                }
            }
        }
    }

    // 2. 检查当前工作目录与前端工程源码结构 (本地开发调试态)
    let search_roots = [
        PathBuf::from("."),
        PathBuf::from("./src-tauri"),
        PathBuf::from("./src-tauri/binaries"),
        PathBuf::from("../backend/dist"),
        PathBuf::from("../../backend/dist"),
        PathBuf::from("../frontend/src-tauri/binaries"),
    ];

    for root in &search_roots {
        for name in &candidate_names {
            let candidate = root.join(name);
            if candidate.exists() {
                return Some(std::fs::canonicalize(candidate).unwrap_or(root.join(name)));
            }
        }
    }

    None
}

/// 轮询后端健康探针直至 HTTP 200 Ready
fn wait_for_backend_ready(port: u16, max_retries: usize) -> bool {
    for _ in 0..max_retries {
        std::thread::sleep(Duration::from_millis(200));
        // 使用 TcpStream 简单快速探测连接就绪
        if let Ok(mut stream) = std::net::TcpStream::connect(("127.0.0.1", port)) {
            use std::io::{Read, Write};
            let req = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n", port);
            if stream.write_all(req.as_bytes()).is_ok() {
                let mut buf = [0u8; 256];
                if let Ok(n) = stream.read(&mut buf) {
                    let response_header = String::from_utf8_lossy(&buf[..n]);
                    if response_header.contains("200 OK") || response_header.contains("healthy") {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[tauri::command]
fn get_backend_url(state: State<'_, BackendState>) -> String {
    format!("http://127.0.0.1:{}/api/v1", state.port)
}

#[tauri::command]
fn get_backend_port(state: State<'_, BackendState>) -> u16 {
    state.port
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. 动态探测空闲回环端口
    let allocated_port = find_available_port(18000, 18999);
    println!("[Tauri Watchdog] 已动态分配本地空闲端口: {}", allocated_port);

    // 2. 隔离用户数据目录至 %APPDATA%/TunnelDrainagePlatform
    let data_dir = std::env::var("APPDATA")
        .map(|appdata| PathBuf::from(appdata).join("TunnelDrainagePlatform"))
        .unwrap_or_else(|_| PathBuf::from("./tunnel_data"));
    let _ = std::fs::create_dir_all(&data_dir);

    // 3. 解析 Sidecar 独立进程可执行路径
    let sidecar_opt = resolve_sidecar_executable();
    let current_pid = std::process::id();

    // 4. 创建 Win32 Job Object
    #[cfg(windows)]
    let job_guard = Win32JobGuard::new();

    let mut spawned_child: Option<Child> = None;

    if let Some(sidecar_path) = sidecar_opt {
        println!("[Tauri Watchdog] 启动 Sidecar 子进程: {:?}", sidecar_path);

        let mut cmd = Command::new(&sidecar_path);
        cmd.arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(allocated_port.to_string())
            .arg("--db-dir")
            .arg(data_dir.to_str().unwrap_or("."))
            .arg("--parent-pid")
            .arg(current_pid.to_string());

        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW = 0x08000000 阻止出现黑色命令行窗口
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child) => {
                #[cfg(windows)]
                if let Some(ref guard) = job_guard {
                    if guard.assign_child(&child) {
                        println!("[Tauri Watchdog] 成功将 Sidecar 挂载至 Windows Job Object 守护管线");
                    } else {
                        eprintln!("[Tauri Watchdog] 警告: 挂载 Job Object 失败，依赖心跳看门狗保活");
                    }
                }

                // 轮询探针直到后端就绪
                if wait_for_backend_ready(allocated_port, 40) {
                    println!("[Tauri Watchdog] 后端健康检查通过，服务已就绪！");
                } else {
                    eprintln!("[Tauri Watchdog] 后端握手超时，尝试继续加载前端");
                }

                spawned_child = Some(child);
            }
            Err(e) => {
                eprintln!("[Tauri Watchdog] 拉起 Sidecar 进程失败: {:?}", e);
            }
        }
    } else {
        eprintln!("[Tauri Watchdog] 未检索到 Sidecar 二进制，可能处于纯静态或外部服务模式");
    }

    let child_holder = Arc::new(Mutex::new(spawned_child));
    let child_holder_for_exit = Arc::clone(&child_holder);

    let backend_state = BackendState {
        port: allocated_port,
        child: child_holder,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(backend_state)
        .invoke_handler(tauri::generate_handler![get_backend_url, get_backend_port])
        .setup(move |app| {
            // 向前端注入全局动态 API 路径
            if let Some(main_window) = app.get_webview_window("main") {
                let init_script = format!(
                    "window.__DESKTOP_API_BASE__ = 'http://127.0.0.1:{}/api/v1';",
                    allocated_port
                );
                let _ = main_window.eval(&init_script);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // 应用退出时，主动清理子进程
                if let Ok(mut lock) = child_holder_for_exit.lock() {
                    if let Some(mut child) = lock.take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
