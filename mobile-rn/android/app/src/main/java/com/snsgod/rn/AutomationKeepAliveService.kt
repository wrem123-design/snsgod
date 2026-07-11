package com.snsgod.rn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Foreground service that raises process priority so JS automation timers
 * (선톡 / SNS / phone invite) can keep running while the UI is backgrounded.
 * Fully force-stopped apps cannot continue; this only covers "home / 다른 앱" cases.
 */
class AutomationKeepAliveService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    acquireWakeLock()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfSafely()
      return START_NOT_STICKY
    }

    return try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceCompat.startForeground(
          this,
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      START_STICKY
    } catch (error: Exception) {
      // Never let keep-alive take down the whole app process.
      stopSelf()
      START_NOT_STICKY
    }
  }

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun stopSelfSafely() {
    try {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } catch (_: Exception) {
      // ignore
    }
    stopSelf()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "자동화 실행",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "앱이 백그라운드에 있을 때도 선톡·SNS 자동화를 유지합니다."
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("snsgod://notifications"), this, MainActivity::class.java)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val stopIntent = Intent(this, AutomationKeepAliveService::class.java).apply {
      action = ACTION_STOP
    }
    val stopPending = PendingIntent.getService(
      this,
      1,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("SNSGod 자동화 실행 중")
      .setContentText("백그라운드에서도 설정한 선톡·SNS 자동화를 유지합니다.")
      .setSmallIcon(R.drawable.ic_notification)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .addAction(0, "중지", stopPending)
      .build()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val power = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    wakeLock = power.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "SNSGod:AutomationKeepAlive"
    ).apply {
      setReferenceCounted(false)
      acquire(6 * 60 * 60 * 1000L) // auto-release after 6h; restart on next start()
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Exception) {
      // ignore
    }
    wakeLock = null
  }

  companion object {
    const val CHANNEL_ID = "snsgod_automation_keepalive"
    const val NOTIFICATION_ID = 7101
    const val ACTION_STOP = "com.snsgod.rn.action.STOP_AUTOMATION_KEEPALIVE"
  }
}
