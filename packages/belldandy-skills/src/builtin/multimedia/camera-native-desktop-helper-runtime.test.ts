import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NativeDesktopHelperRuntimeError,
  NativeDesktopWindowsHelperRuntime,
} from "./camera-native-desktop-helper-runtime.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-native-helper-runtime-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("camera native desktop helper runtime", () => {
  it("diagnoses capabilities and device inventory from PowerShell and ffmpeg", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "Logitech Brio",
              pnpDeviceId: "USB\\VID_046D&PID_085E\\ABC123",
              pnpClass: "Camera",
              manufacturer: "Logitech",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: "ffmpeg version n7",
          stderr: [
            "[dshow @ 000001] DirectShow video devices",
            "[dshow @ 000001] \"Logitech Brio\"",
            "[dshow @ 000001] Alternative name \"@device_pnp_\\\\?\\usb#vid_046d&pid_085e#abc123#{00000000-0000-0000-0000-000000000000}\\global\"",
            "[dshow @ 000001] DirectShow audio devices",
          ].join("\n"),
        };
      }),
    });

    const result = await runtime.diagnose({
      includeCapabilities: true,
      includeDevices: true,
      includePermissionState: true,
    });

    expect(result.status).toBe("available");
    expect(result.capabilities?.snapshot).toBe(true);
    expect(result.devices).toEqual([
      expect.objectContaining({
        label: "Logitech Brio",
        stableKey: expect.stringContaining("usb-046d-085e"),
      }),
    ]);
  });

  it("captures a snapshot through ffmpeg and returns an artifact path", async () => {
    const tempDir = await createTempDir();
    const outputPath = path.join(tempDir, "capture.png");
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0r0AAAAASUVORK5CYII=",
      "base64",
    );
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "Capture Card",
              pnpDeviceId: "USB\\VID_1234&PID_5678\\CARD001",
              pnpClass: "Image",
              manufacturer: "Magewell",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        if (input.args.includes("-version")) {
          return {
            exitCode: 0,
            stdout: "ffmpeg version n7",
            stderr: "",
          };
        }
        if (input.args.includes("-list_devices")) {
          return {
            exitCode: 0,
            stdout: "",
            stderr: [
              "[dshow @ 000001] DirectShow video devices",
              "[dshow @ 000001] \"Capture Card\"",
              "[dshow @ 000001] Alternative name \"@device_pnp_\\\\?\\usb#vid_1234&pid_5678#card001#{00000000-0000-0000-0000-000000000000}\\global\"",
              "[dshow @ 000001] DirectShow audio devices",
            ].join("\n"),
          };
        }
        await fs.writeFile(outputPath, pngBuffer);
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
        };
      }),
      now: () => new Date("2026-04-17T08:02:00.000Z"),
    });

    const result = await runtime.captureSnapshot({
      selection: {
        deviceId: "USB\\VID_1234&PID_5678\\CARD001",
      },
      output: {
        filePath: outputPath,
        format: "png",
      },
      constraints: {
        width: 1280,
        height: 720,
      },
      timeoutMs: 5_000,
    });

    expect(result.artifact.path).toBe(outputPath);
    expect(result.artifact.sizeBytes).toBeGreaterThan(0);
    expect(result.device.label).toBe("Capture Card");
  });

  it("prefers a DirectShow-capable USB camera when mixed PnP image devices are present", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([
              {
                name: "HP DeskJet 4800 series [A93A61]",
                pnpDeviceId: "SWD\\ESCL\\13FA4829-3462-7DB6-E07F-37B6077083BD",
                pnpClass: "Image",
                manufacturer: "Microsoft",
                status: "OK",
              },
              {
                name: "OBSBOT Tiny 2 StreamCamera",
                pnpDeviceId: "USB\\VID_3564&PID_FEF8&MI_00\\6&20CBB022&0&0000",
                pnpClass: "Camera",
                manufacturer: "Microsoft",
                service: "usbvideo",
                status: "OK",
              },
            ]),
            stderr: "",
          };
        }
        if (input.args.includes("-version")) {
          return {
            exitCode: 0,
            stdout: "ffmpeg version n7",
            stderr: "",
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: [
            "[dshow @ 000001] \"OBSBOT Tiny 2 StreamCamera\" (video)",
            "[dshow @ 000001]   Alternative name \"@device_pnp_\\\\?\\usb#vid_3564&pid_fef8&mi_00#6&20cbb022&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global\"",
            "[dshow @ 000001] \"OBSBOT Tiny2 Microphone (OBSBOT Tiny2 Audio)\" (audio)",
          ].join("\n"),
        };
      }),
    });

    const result = await runtime.listDevices({
      selection: {
        facing: "front",
      },
      includeUnavailable: true,
      includeBusy: true,
    });

    expect(result.selectedStableKey).toBe("usb-3564-fef8-453a4b75");
    expect(result.selectionReason).toBe("helper_default");
    expect(result.devices).toContainEqual(expect.objectContaining({
      label: "OBSBOT Tiny 2 StreamCamera",
      source: "external",
      external: true,
      metadata: expect.objectContaining({
        captureSupported: true,
        ffmpegDeviceName: "OBSBOT Tiny 2 StreamCamera",
      }),
    }));
  });

  it("retries snapshot capture with yuyv422 when the default ffmpeg negotiation returns invalid mjpeg data", async () => {
    const tempDir = await createTempDir();
    const outputPath = path.join(tempDir, "obsbot-capture.png");
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0r0AAAAASUVORK5CYII=",
      "base64",
    );
    const runCommand = vi.fn(async (input) => {
      if (input.command === "powershell.exe") {
        if (input.args.includes("Write-Output 'ok'")) {
          return {
            exitCode: 0,
            stdout: "ok\n",
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: JSON.stringify([{
            name: "OBSBOT Tiny 2 StreamCamera",
            pnpDeviceId: "USB\\VID_3564&PID_FEF8&MI_00\\6&20CBB022&0&0000",
            pnpClass: "Camera",
            manufacturer: "Microsoft",
            service: "usbvideo",
            status: "OK",
          }]),
          stderr: "",
        };
      }
      if (input.args.includes("-version")) {
        return {
          exitCode: 0,
          stdout: "ffmpeg version n7",
          stderr: "",
        };
      }
      if (input.args.includes("-list_devices")) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: [
            "[dshow @ 000001] \"OBSBOT Tiny 2 StreamCamera\" (video)",
            "[dshow @ 000001]   Alternative name \"@device_pnp_\\\\?\\usb#vid_3564&pid_fef8&mi_00#6&20cbb022&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global\"",
          ].join("\n"),
        };
      }
      if (input.args.includes("-pixel_format") && input.args.includes("yuyv422")) {
        await fs.writeFile(outputPath, pngBuffer);
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
        };
      }
      return {
        exitCode: 1,
        stdout: "",
        stderr: "[mjpeg @ 000001] No JPEG data found in image",
      };
    });

    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand,
    });

    const result = await runtime.captureSnapshot({
      selection: {
        deviceId: "USB\\VID_3564&PID_FEF8&MI_00\\6&20CBB022&0&0000",
      },
      output: {
        filePath: outputPath,
        format: "png",
      },
      constraints: {
        width: 1280,
        height: 720,
      },
      timeoutMs: 5_000,
    });

    expect(result.artifact.path).toBe(outputPath);
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      command: expect.any(String),
      args: expect.arrayContaining(["-pixel_format", "yuyv422"]),
    }));
  });

  it("returns a structured unavailable diagnose result when device enumeration fails", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 1,
            stdout: "",
            stderr: "Get-CimInstance failed",
          };
        }
        return {
          exitCode: 0,
          stdout: "ffmpeg version n7",
          stderr: "",
        };
      }),
    });

    const result = await runtime.diagnose({
      includeCapabilities: true,
      includeDevices: true,
      includePermissionState: true,
    });

    expect(result.status).toBe("unavailable");
    expect(result.devices).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "helper_unavailable",
      message: expect.stringContaining("PowerShell device enumeration failed"),
    }));
  });

  it("reidentifies a stale deviceRef after the USB camera instance path changes", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "OBSBOT Tiny 2 StreamCamera",
              pnpDeviceId: "USB\\VID_3564&PID_FEF8&MI_00\\7&11AA22BB&0&0000",
              pnpClass: "Camera",
              manufacturer: "Microsoft",
              service: "usbvideo",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: [
            "[dshow @ 000001] \"OBSBOT Tiny 2 StreamCamera\" (video)",
            "[dshow @ 000001]   Alternative name \"@device_pnp_\\\\?\\usb#vid_3564&pid_fef8&mi_00#7&11aa22bb&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global\"",
          ].join("\n"),
        };
      }),
    });

    const result = await runtime.listDevices({
      selection: {
        deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
        facing: "front",
      },
      includeUnavailable: true,
      includeBusy: true,
    });

    expect(result.selectionReason).toBe("explicit_device_ref_reidentified");
    expect(result.selectedStableKey).toMatch(/^usb-3564-fef8-/u);
    expect(result.selectedStableKey).not.toBe("usb-3564-fef8-453a4b75");
    expect(result.selectedDeviceId).toBe("USB\\VID_3564&PID_FEF8&MI_00\\7&11AA22BB&0&0000");
    expect(result.devices[0]?.metadata).toEqual(expect.objectContaining({
      vendorId: "3564",
      productId: "fef8",
      instancePath: "USB\\VID_3564&PID_FEF8&MI_00\\7&11AA22BB&0&0000",
    }));
  });

  it("reidentifies a stale stableKey when the USB camera is rediscovered on another port", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "OBSBOT Tiny 2 StreamCamera",
              pnpDeviceId: "USB\\VID_3564&PID_FEF8&MI_00\\9&99CC44DD&0&0000",
              pnpClass: "Camera",
              manufacturer: "Microsoft",
              service: "usbvideo",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: [
            "[dshow @ 000001] \"OBSBOT Tiny 2 StreamCamera\" (video)",
            "[dshow @ 000001]   Alternative name \"@device_pnp_\\\\?\\usb#vid_3564&pid_fef8&mi_00#9&99cc44dd&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global\"",
          ].join("\n"),
        };
      }),
    });

    const result = await runtime.listDevices({
      selection: {
        stableKey: "usb-3564-fef8-453a4b75",
        facing: "front",
      },
      includeUnavailable: true,
      includeBusy: true,
    });

    expect(result.selectionReason).toBe("explicit_stable_key_reidentified");
    expect(result.selectedStableKey).toMatch(/^usb-3564-fef8-/u);
    expect(result.selectedStableKey).not.toBe("usb-3564-fef8-453a4b75");
  });

  it("returns device_busy when ffmpeg reports that the selected camera is in use", async () => {
    const tempDir = await createTempDir();
    const outputPath = path.join(tempDir, "busy-camera.png");
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "OBSBOT Tiny 2 StreamCamera",
              pnpDeviceId: "USB\\VID_3564&PID_FEF8&MI_00\\6&20CBB022&0&0000",
              pnpClass: "Camera",
              manufacturer: "Microsoft",
              service: "usbvideo",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        if (input.args.includes("-version")) {
          return {
            exitCode: 0,
            stdout: "ffmpeg version n7",
            stderr: "",
          };
        }
        if (input.args.includes("-list_devices")) {
          return {
            exitCode: 1,
            stdout: "",
            stderr: [
              "[dshow @ 000001] \"OBSBOT Tiny 2 StreamCamera\" (video)",
              "[dshow @ 000001]   Alternative name \"@device_pnp_\\\\?\\usb#vid_3564&pid_fef8&mi_00#6&20cbb022&0&0000#{65e8773d-8f56-11d0-a3b9-00a0c9223196}\\global\"",
            ].join("\n"),
          };
        }
        return {
          exitCode: 1,
          stdout: "",
          stderr: "[dshow @ 000001] The requested resource is in use.",
        };
      }),
    });

    await expect(runtime.captureSnapshot({
      selection: {
        deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
      },
      output: {
        filePath: outputPath,
        format: "png",
      },
      constraints: {
        width: 1280,
        height: 720,
      },
      timeoutMs: 5_000,
    })).rejects.toMatchObject({
      code: "device_busy",
      retryable: true,
    } satisfies Partial<NativeDesktopHelperRuntimeError>);
  });

  it("reports requested stale deviceRef as unavailable instead of pretending it is still selected", async () => {
    const runtime = new NativeDesktopWindowsHelperRuntime({
      runCommand: vi.fn(async (input) => {
        if (input.command === "powershell.exe") {
          if (input.args.includes("Write-Output 'ok'")) {
            return {
              exitCode: 0,
              stdout: "ok\n",
              stderr: "",
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify([{
              name: "HP DeskJet 4800 series [A93A61]",
              pnpDeviceId: "SWD\\ESCL\\13FA4829-3462-7DB6-E07F-37B6077083BD",
              pnpClass: "Image",
              manufacturer: "Microsoft",
              status: "OK",
            }]),
            stderr: "",
          };
        }
        return {
          exitCode: 0,
          stdout: "ffmpeg version n7",
          stderr: "",
        };
      }),
    });

    const result = await runtime.listDevices({
      selection: {
        deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
        facing: "front",
      },
      includeUnavailable: true,
      includeBusy: true,
    });

    expect(result.selectedDeviceId).toBeUndefined();
    expect(result.selectedStableKey).toBeUndefined();
    expect(result.selectionReason).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "device_not_found",
      severity: "warning",
      message: "Requested native_desktop camera device is not currently available.",
    }));
  });
});
