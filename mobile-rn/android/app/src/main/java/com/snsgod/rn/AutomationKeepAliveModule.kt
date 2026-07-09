package com.snsgod.rn

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutomationKeepAliveModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AutomationKeepAlive"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(reactContext, AutomationKeepAliveService::class.java)
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("KEEPALIVE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val stopped = reactContext.stopService(Intent(reactContext, AutomationKeepAliveService::class.java))
      promise.resolve(stopped)
    } catch (error: Exception) {
      promise.reject("KEEPALIVE_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun isSupported(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val ignoring = power?.isIgnoringBatteryOptimizations(reactContext.packageName) == true
      promise.resolve(ignoring)
    } catch (error: Exception) {
      promise.reject("BATTERY_CHECK_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve("unsupported")
        return
      }
      val power = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (power?.isIgnoringBatteryOptimizations(reactContext.packageName) == true) {
        promise.resolve("already")
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve("requested")
    } catch (error: Exception) {
      // Fall back to general battery settings list if direct request is blocked.
      try {
        openBatteryOptimizationSettingsInternal()
        promise.resolve("opened_settings")
      } catch (fallback: Exception) {
        promise.reject("BATTERY_REQUEST_FAILED", fallback.message ?: error.message, fallback)
      }
    }
  }

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) {
    try {
      openBatteryOptimizationSettingsInternal()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("BATTERY_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openAppDetailsSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("APP_DETAILS_FAILED", error.message, error)
    }
  }

  private fun openBatteryOptimizationSettingsInternal() {
    val packageUri = Uri.parse("package:${reactContext.packageName}")
    val candidates = listOf(
      Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply { data = packageUri },
      Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply { data = packageUri }
    )
    var lastError: Exception? = null
    for (intent in candidates) {
      try {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(reactContext.packageManager) != null || intent.action == Settings.ACTION_APPLICATION_DETAILS_SETTINGS) {
          reactContext.startActivity(intent)
          return
        }
      } catch (error: Exception) {
        lastError = error
      }
    }
    throw lastError ?: IllegalStateException("No battery settings activity available")
  }
}
