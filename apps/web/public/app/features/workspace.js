function createReq(sendReq, makeId, method, params) {
  return sendReq({
    type: "req",
    id: makeId(),
    method,
    params,
  });
}

function setSidebarActionButtonState(button, active) {
  if (!button) return;
  button.classList.toggle("is-active", Boolean(active));
}

export function createWorkspaceFeature({
  refs,
  keys,
  isConnected,
  sendReq,
  makeId,
  switchMode,
  showNotice,
  escapeHtml,
  loadServerConfig,
  syncAttachmentLimitsFromConfig,
  persistWorkspaceRootsField,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    sidebarEl,
    sidebarTitleEl,
    fileTreeEl,
    refreshTreeBtn,
    editorPathEl,
    editorModeBadgeEl,
    editorTextareaEl,
    cancelEditBtn,
    saveEditBtn,
    openEnvEditorBtn,
    switchRootBtn,
    switchFacetBtn,
    switchCronBtn,
    workspaceRootsEl,
  } = refs;
  const { workspaceRootsKey } = keys;

  let sidebarExpanded = false;
  let currentEditPath = null;
  let originalContent = null;
  let currentEditReadOnly = false;
  let currentTreeMode = "root";
  const expandedFolders = new Set();
  let lastRootTreePlaceholder = {
    key: "common.loading",
    fallback: "Loading...",
  };

  if (sidebarEl) {
    sidebarEl.classList.add("collapsed");
  }

  if (sidebarTitleEl) {
    sidebarTitleEl.addEventListener("click", () => toggleSidebar());
  }
  if (refreshTreeBtn) {
    refreshTreeBtn.addEventListener("click", () => {
      void loadFileTree();
    });
  }
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => cancelEdit());
  }
  if (saveEditBtn) {
    saveEditBtn.addEventListener("click", () => {
      void saveFile();
    });
  }
  if (openEnvEditorBtn) {
    openEnvEditorBtn.addEventListener("click", () => {
      void openEnvFile();
    });
  }
  if (switchRootBtn) {
    switchRootBtn.addEventListener("click", () => switchTreeMode("root"));
  }
  if (switchFacetBtn) {
    switchFacetBtn.addEventListener("click", () => switchTreeMode("facets"));
  }
  if (switchCronBtn) {
    switchCronBtn.addEventListener("click", () => switchTreeMode("cron"));
  }

  updateSidebarTitle();

  function getTreeMode() {
    return currentTreeMode;
  }

  function isSidebarExpanded() {
    return sidebarExpanded;
  }

  function refreshAfterConnectionReady() {
    if (sidebarExpanded) {
      void loadFileTree();
    }
  }

  function renderTreePlaceholderHtml(key, fallback, style = "") {
    const safeStyle = style ? ` style="${style}"` : "";
    return `<div class="tree-loading"${safeStyle}>${escapeHtml(t(key, {}, fallback))}</div>`;
  }

  function setRootTreePlaceholder(key, fallback) {
    lastRootTreePlaceholder = { key, fallback };
    if (fileTreeEl) {
      fileTreeEl.innerHTML = renderTreePlaceholderHtml(key, fallback);
    }
  }

  async function loadWorkspaceRootsFromServer() {
    if (!isConnected()) return;

    const config = await loadServerConfig?.();
    if (!config) return;
    syncAttachmentLimitsFromConfig?.(config);
    const serverValue = config.BELLDANDY_EXTRA_WORKSPACE_ROOTS;
    if (workspaceRootsEl && serverValue && serverValue !== "[REDACTED]") {
      workspaceRootsEl.value = serverValue;
      persistWorkspaceRootsField?.({ workspaceRootsKey, workspaceRootsEl });
    }
  }

  function toggleSidebar() {
    sidebarExpanded = !sidebarExpanded;
    if (!sidebarEl) return;

    if (sidebarExpanded) {
      sidebarEl.classList.remove("collapsed");
      if (isConnected()) {
        void loadFileTree();
      }
      return;
    }

    sidebarEl.classList.add("collapsed");
  }

  function switchTreeMode(mode) {
    if (currentTreeMode === mode) {
      if (!sidebarExpanded) {
        toggleSidebar();
      } else {
        void loadFileTree();
      }
      switchMode("chat");
      return;
    }

    currentTreeMode = mode;
    expandedFolders.clear();
    updateSidebarTitle();
    switchMode("chat");

    if (!sidebarExpanded) {
      toggleSidebar();
      return;
    }
    void loadFileTree();
  }

  function applyEditorSession({ path, content, readOnly = false, label, startLine }) {
    currentEditPath = path;
    originalContent = content;
    currentEditReadOnly = readOnly;

    if (editorPathEl) {
      editorPathEl.textContent = label || path || "文件路径";
    }
    if (editorTextareaEl) {
      editorTextareaEl.value = content || "";
      editorTextareaEl.readOnly = readOnly;
    }
    if (editorModeBadgeEl) {
      editorModeBadgeEl.classList.toggle("hidden", !readOnly);
      editorModeBadgeEl.textContent = readOnly ? "只读来源" : "可编辑";
    }
    if (saveEditBtn) {
      saveEditBtn.disabled = readOnly;
      saveEditBtn.textContent = readOnly ? "只读" : "保存";
      saveEditBtn.title = readOnly ? "当前为只读源文件视图" : "";
    }

    switchMode("editor");
    if (typeof startLine === "number" && startLine > 0) {
      focusEditorLine(startLine);
    }
  }

  function focusEditorLine(lineNumber) {
    if (!editorTextareaEl || typeof lineNumber !== "number" || lineNumber <= 0) return;
    const lines = editorTextareaEl.value.split("\n");
    const safeLine = Math.max(1, Math.min(lineNumber, lines.length));
    let offset = 0;
    for (let i = 0; i < safeLine - 1; i += 1) {
      offset += lines[i].length + 1;
    }
    const lineText = lines[safeLine - 1] || "";
    editorTextareaEl.focus();
    editorTextareaEl.setSelectionRange(offset, offset + lineText.length);
    const lineHeight = parseFloat(getComputedStyle(editorTextareaEl).lineHeight || "22");
    editorTextareaEl.scrollTop = Math.max(0, (safeLine - 3) * lineHeight);
  }

  function resetEditorAccessState() {
    currentEditReadOnly = false;
    if (editorTextareaEl) {
      editorTextareaEl.readOnly = false;
    }
    if (editorModeBadgeEl) {
      editorModeBadgeEl.classList.add("hidden");
      editorModeBadgeEl.textContent = "只读来源";
    }
    if (saveEditBtn) {
      saveEditBtn.disabled = false;
      saveEditBtn.textContent = "保存";
      saveEditBtn.title = "";
    }
  }

  async function openEnvFile() {
    if (!isConnected()) {
      showNotice("无法打开配置", "未连接到服务器。", "error");
      return;
    }

    const res = await createReq(sendReq, makeId, "config.readRaw");
    if (!res || !res.ok) {
      const msg = res?.error?.message || "读取失败";
      showNotice("无法读取配置文件", msg, "error");
      return;
    }

    applyEditorSession({
      path: ".env",
      content: typeof res.payload?.content === "string" ? res.payload.content : "",
      readOnly: false,
      label: ".env (环境配置)",
    });
  }

  async function loadFileTree(folderPath = "") {
    if (!isConnected()) {
      if (fileTreeEl && !folderPath) {
        setRootTreePlaceholder("sidebar.disconnected", "Disconnected");
      }
      return [];
    }

    const resolvedPath = currentTreeMode === "facets" && !folderPath ? "facets" : folderPath;
    const res = await createReq(sendReq, makeId, "workspace.list", {
      path: resolvedPath,
    });

    if (!res || !res.ok || !Array.isArray(res.payload?.items)) {
      if (fileTreeEl && !folderPath) {
        setRootTreePlaceholder("sidebar.loadFailed", "Load failed");
      }
      return [];
    }

    let items = res.payload.items;
    if (currentTreeMode === "cron" && !folderPath) {
      const cronTargets = new Set(["HEARTBEAT.md", "cron-jobs.json"]);
      items = items.filter((item) => item?.type === "file" && cronTargets.has(item.name));
    }
    if (!folderPath) {
      renderFileTree(items);
    }
    return items;
  }

  function updateSidebarTitle() {
    if (!sidebarTitleEl) return;
    if (currentTreeMode === "facets") {
      sidebarTitleEl.textContent = t("sidebar.facetFiles", {}, "模组文件");
      return;
    }
    if (currentTreeMode === "cron") {
      sidebarTitleEl.textContent = t("sidebar.cronFiles", {}, "定时任务文件");
      return;
    }
    sidebarTitleEl.textContent = t("sidebar.fileList", {}, "文件列表");
  }

  function renderFileTree(items) {
    if (!fileTreeEl) return;

    fileTreeEl.textContent = "";
    if (!Array.isArray(items) || items.length === 0) {
      setRootTreePlaceholder("sidebar.noFiles", "No files");
      return;
    }
    lastRootTreePlaceholder = null;

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      fragment.appendChild(createTreeItem(item));
    }
    fileTreeEl.appendChild(fragment);
  }

  function createTreeItem(item) {
    if (item.type === "directory") {
      const folder = document.createElement("div");
      folder.className = "tree-folder";
      if (expandedFolders.has(item.path)) {
        folder.classList.add("expanded");
      }

      const header = document.createElement("div");
      header.className = "tree-item";
      header.innerHTML = `
        <span class="tree-item-icon"></span>
        <span class="tree-item-name">${escapeHtml(item.name)}</span>
      `;
      header.addEventListener("click", () => {
        void toggleFolder(item.path, folder);
      });

      const children = document.createElement("div");
      children.className = "tree-children";

      folder.appendChild(header);
      folder.appendChild(children);

      if (expandedFolders.has(item.path)) {
        void loadFolderChildren(item.path, children);
      }

      return folder;
    }

    const file = document.createElement("div");
    file.className = "tree-file";

    const fileItem = document.createElement("div");
    fileItem.className = "tree-item";
    if (currentEditPath === item.path) {
      fileItem.classList.add("active");
    }
    fileItem.innerHTML = `
      <span class="tree-item-icon"></span>
      <span class="tree-item-name">${escapeHtml(item.name)}</span>
    `;
    fileItem.addEventListener("click", () => {
      void openFile(item.path);
    });

    file.appendChild(fileItem);
    return file;
  }

  async function toggleFolder(folderPath, folderEl) {
    if (expandedFolders.has(folderPath)) {
      expandedFolders.delete(folderPath);
      folderEl.classList.remove("expanded");
      return;
    }

    expandedFolders.add(folderPath);
    folderEl.classList.add("expanded");

    const children = folderEl.querySelector(".tree-children");
    if (children && children.children.length === 0) {
      await loadFolderChildren(folderPath, children);
    }
  }

  async function loadFolderChildren(folderPath, containerEl) {
    containerEl.innerHTML = renderTreePlaceholderHtml("sidebar.loading", "Loading...", "padding: 4px 8px; font-size: 12px;");
    const items = await loadFileTree(folderPath);
    containerEl.textContent = "";

    if (!items || items.length === 0) {
      containerEl.innerHTML = renderTreePlaceholderHtml("sidebar.empty", "Empty", "padding: 4px 8px; font-size: 12px; color: var(--text-muted);");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of items) {
      fragment.appendChild(createTreeItem(item));
    }
    containerEl.appendChild(fragment);
  }

  async function openFile(filePath) {
    if (!isConnected()) {
      showNotice("无法打开文件", "未连接到服务器。", "error");
      return;
    }

    const res = await createReq(sendReq, makeId, "workspace.read", { path: filePath });
    if (!res || !res.ok) {
      const msg = res?.error?.message || "读取失败";
      showNotice("无法读取文件", msg, "error");
      return;
    }

    applyEditorSession({
      path: filePath,
      content: typeof res.payload?.content === "string" ? res.payload.content : "",
      readOnly: false,
      label: filePath,
    });
    void loadFileTree();
  }

  async function openSourcePath(sourcePath, options = {}) {
    if (!isConnected()) {
      showNotice("无法打开来源文件", "未连接到服务器。", "error");
      return;
    }
    if (!sourcePath || typeof sourcePath !== "string") {
      showNotice("无法打开来源文件", "无效的来源路径。", "error");
      return;
    }

    const res = await createReq(sendReq, makeId, "workspace.readSource", { path: sourcePath });
    if (!res || !res.ok) {
      const msg = res?.error?.message || "读取失败";
      showNotice("无法打开来源文件", msg, "error", 4200);
      return;
    }

    applyEditorSession({
      path: res.payload?.path || sourcePath,
      content: typeof res.payload?.content === "string" ? res.payload.content : "",
      readOnly: true,
      label: `${res.payload?.path || sourcePath} (只读来源)`,
      startLine: options.startLine,
    });
    showNotice("来源文件已打开", "当前为只读视图，不会写回原文件。", "info", 2600);
  }

  async function readSourceFile(sourcePath) {
    if (!isConnected()) return null;
    if (!sourcePath || typeof sourcePath !== "string") return null;

    const res = await createReq(sendReq, makeId, "workspace.readSource", { path: sourcePath });
    if (!res || !res.ok) return null;
    return {
      path: res.payload?.path || sourcePath,
      content: typeof res.payload?.content === "string" ? res.payload.content : "",
    };
  }

  async function saveFile() {
    if (!isConnected()) {
      showNotice("无法保存", "未连接到服务器。", "error");
      return;
    }
    if (currentEditReadOnly) {
      showNotice("当前不可保存", "这是只读来源视图，不能直接写回。", "error");
      return;
    }
    if (!currentEditPath) {
      showNotice("无法保存", "没有正在编辑的文件。", "error");
      return;
    }

    const content = editorTextareaEl ? editorTextareaEl.value : "";
    if (saveEditBtn) {
      saveEditBtn.textContent = "保存中...";
      saveEditBtn.disabled = true;
    }

    const method = currentEditPath === ".env" ? "config.writeRaw" : "workspace.write";
    const params = currentEditPath === ".env"
      ? { content }
      : { path: currentEditPath, content };
    const res = await createReq(sendReq, makeId, method, params);

    if (saveEditBtn) {
      saveEditBtn.disabled = false;
    }

    if (!res || !res.ok) {
      if (saveEditBtn) {
        saveEditBtn.textContent = "保存";
      }
      const msg = res?.error?.message || "保存失败";
      showNotice("保存失败", msg, "error");
      return;
    }

    if (saveEditBtn) {
      saveEditBtn.textContent = "已保存";
    }
    showNotice("保存成功", `${currentEditPath} 已写入。`, "success", 1800);

    setTimeout(() => {
      if (saveEditBtn) {
        saveEditBtn.textContent = "保存";
      }
      switchMode("chat");
      currentEditPath = null;
      originalContent = null;
      resetEditorAccessState();
      void loadFileTree();
    }, 500);
  }

  function cancelEdit() {
    if (originalContent !== null && editorTextareaEl) {
      if (editorTextareaEl.value !== originalContent && !confirm("放弃修改？")) {
        return;
      }
    }

    switchMode("chat");
    currentEditPath = null;
    originalContent = null;
    resetEditorAccessState();
    void loadFileTree();
  }

  return {
    cancelEdit,
    getTreeMode,
    isSidebarExpanded,
    loadFileTree,
    loadWorkspaceRootsFromServer,
    openEnvFile,
    openFile,
    openSourcePath,
    readSourceFile,
    refreshLocale() {
      updateSidebarTitle();
      if (lastRootTreePlaceholder && fileTreeEl) {
        fileTreeEl.innerHTML = renderTreePlaceholderHtml(
          lastRootTreePlaceholder.key,
          lastRootTreePlaceholder.fallback,
        );
      }
    },
    refreshAfterConnectionReady,
    saveFile,
    switchTreeMode,
    toggleSidebar,
  };
}

export { setSidebarActionButtonState };
