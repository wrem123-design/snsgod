package com.snsgod.rn

import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TermuxBridgeModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "TermuxBridge"

  @ReactMethod
  fun openTermux(promise: Promise) {
    try {
      val intent = reactContext.packageManager.getLaunchIntentForPackage("com.termux")
      if (intent == null) {
        promise.reject("TERMUX_NOT_FOUND", "Termux가 설치되어 있지 않습니다.")
        return
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve("Termux를 열었습니다.")
    } catch (error: Exception) {
      promise.reject("TERMUX_OPEN_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun runCommand(command: String, promise: Promise) {
    try {
      val intent = Intent("com.termux.RUN_COMMAND")
      intent.setClassName("com.termux", "com.termux.app.RunCommandService")
      intent.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/sh")
      intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-lc", command))
      intent.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
      intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", false)
      intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve("Termux에 실행 명령을 보냈습니다.")
    } catch (error: SecurityException) {
      promise.reject(
        "TERMUX_PERMISSION_DENIED",
        "Termux 외부 명령 권한이 막혀 있습니다. Termux에서 ~/.termux/termux.properties에 allow-external-apps = true를 설정하거나, ADB 권한 승인 후 다시 시도하세요.",
        error
      )
    } catch (error: Exception) {
      promise.reject("TERMUX_RUN_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun copyText(text: String, promise: Promise) {
    try {
      val clipboard = reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("SNSGod", text))
      promise.resolve("클립보드에 복사했습니다.")
    } catch (error: Exception) {
      promise.reject("CLIPBOARD_FAILED", error.message, error)
    }
  }
}
