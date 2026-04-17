import type {
  CameraListRequest,
  CameraListResponse,
  CameraProvider,
  CameraProviderContext,
  CameraSnapshotRequest,
  CameraSnapshotResponse,
} from "./camera-contract.js";
import {
  captureCameraSnapshot as captureBrowserLoopbackSnapshot,
  listCameraDevices as listBrowserLoopbackDevices,
} from "./camera-runtime.js";

export const browserLoopbackCameraProvider: CameraProvider = {
  id: "browser_loopback",
  capabilities: {
    diagnose: false,
    list: true,
    snapshot: true,
    clip: false,
    audio: false,
    hotplug: true,
    background: false,
  },
  async listDevices(
    input: CameraListRequest,
    context: CameraProviderContext,
  ): Promise<CameraListResponse> {
    return listBrowserLoopbackDevices(context, input);
  },
  async captureSnapshot(
    input: CameraSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraSnapshotResponse> {
    return captureBrowserLoopbackSnapshot(context, input);
  },
};
