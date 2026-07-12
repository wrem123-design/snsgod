package com.snsgod.rn

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * Renders Oracle message pushes as Android conversations led by the character.
 * Other Expo notification payloads continue through the standard Expo service.
 */
class CharacterMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    if (remoteMessage.data[DATA_NATIVE_CONVERSATION] != "1") {
      super.onMessageReceived(remoteMessage)
      return
    }

    val characterName = remoteMessage.data[DATA_CHARACTER_NAME]?.trim()?.take(MAX_NAME_LENGTH).orEmpty()
    val messageBody = remoteMessage.data[DATA_MESSAGE_BODY]?.trim()?.take(MAX_BODY_LENGTH).orEmpty()
    val roomId = remoteMessage.data[DATA_ROOM_ID]?.trim()?.take(MAX_ID_LENGTH).orEmpty()
    val messageId = remoteMessage.data[DATA_MESSAGE_ID]?.trim()?.take(MAX_ID_LENGTH).orEmpty()
    if (characterName.isBlank() || messageBody.isBlank() || roomId.isBlank() || messageId.isBlank()) return

    try {
      ensureMessageChannel()
      showConversationNotification(
        characterName = characterName,
        messageBody = messageBody,
        roomId = roomId,
        messageId = messageId,
        avatar = loadAvatar(remoteMessage.data[DATA_AVATAR_URL].orEmpty())
      )
    } catch (_: Exception) {
      // Push display failures must not crash the app process or token service.
    }
  }

  private fun showConversationNotification(
    characterName: String,
    messageBody: String,
    roomId: String,
    messageId: String,
    avatar: Bitmap?
  ) {
    val launchIntent = Intent(Intent.ACTION_VIEW, Uri.parse("snsgod://notifications"), this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val contentIntent = PendingIntent.getActivity(
      this,
      messageId.hashCode(),
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val avatarIcon = avatar?.let(IconCompat::createWithBitmap)
    val sender = Person.Builder()
      .setName(characterName)
      .setKey("character:${Integer.toHexString(characterName.hashCode())}")
      .apply { if (avatarIcon != null) setIcon(avatarIcon) }
      .build()
    val user = Person.Builder().setName("사용자").setKey("local-user").build()
    val shortcutId = "sns-room-${Integer.toHexString(roomId.hashCode())}"
    val shortcut = ShortcutInfoCompat.Builder(this, shortcutId)
      .setShortLabel(characterName.take(MAX_SHORTCUT_LABEL_LENGTH))
      .setLongLabel(characterName)
      .setIntent(launchIntent)
      .setLongLived(true)
      .setPerson(sender)
      .apply { if (avatarIcon != null) setIcon(avatarIcon) }
      .build()
    ShortcutManagerCompat.pushDynamicShortcut(this, shortcut)

    val style = NotificationCompat.MessagingStyle(user)
      .addMessage(messageBody, System.currentTimeMillis(), sender)
      .setGroupConversation(false)
    val notification = NotificationCompat.Builder(this, MESSAGE_CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle(characterName)
      .setContentText(messageBody)
      .setContentIntent(contentIntent)
      .setStyle(style)
      .setShortcutId(shortcutId)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .build()
    NotificationManagerCompat.from(this).notify(messageId.hashCode() and Int.MAX_VALUE, notification)
  }

  private fun ensureMessageChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(MESSAGE_CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(MESSAGE_CHANNEL_ID, "메시지", NotificationManager.IMPORTANCE_HIGH)
    )
  }

  private fun loadAvatar(value: String): Bitmap? = when {
    value.startsWith("file://", ignoreCase = true) -> loadLocalAvatar(value)
    value.startsWith("https://", ignoreCase = true) -> downloadAvatar(value)
    else -> null
  }

  /** Loads only files owned by this app; a server-supplied path cannot escape those roots. */
  private fun loadLocalAvatar(value: String): Bitmap? {
    val path = Uri.parse(value).path ?: return null
    val candidate = File(path).canonicalFile
    val allowedRoots = buildList {
      add(filesDir.canonicalFile)
      add(cacheDir.canonicalFile)
      add(noBackupFilesDir.canonicalFile)
      getExternalFilesDirs(null).filterNotNull().forEach { add(it.canonicalFile) }
      externalCacheDirs.filterNotNull().forEach { add(it.canonicalFile) }
    }
    val isOwned = allowedRoots.any { root ->
      candidate == root || candidate.path.startsWith(root.path + File.separator)
    }
    if (!isOwned || !candidate.isFile || candidate.length() !in 1..MAX_AVATAR_BYTES.toLong()) return null
    return FileInputStream(candidate).use(BitmapFactory::decodeStream)
  }

  private fun downloadAvatar(value: String): Bitmap? {
    if (!value.startsWith("https://", ignoreCase = true)) return null
    val connection = URL(value).openConnection() as? HttpsURLConnection ?: return null
    return try {
      connection.connectTimeout = NETWORK_TIMEOUT_MS
      connection.readTimeout = NETWORK_TIMEOUT_MS
      connection.instanceFollowRedirects = false
      connection.connect()
      if (connection.responseCode !in 200..299) return null
      if (!connection.contentType.orEmpty().startsWith("image/", ignoreCase = true)) return null
      val bytes = connection.inputStream.use(::readLimitedBytes) ?: return null
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } finally {
      connection.disconnect()
    }
  }

  private fun readLimitedBytes(input: InputStream): ByteArray? {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    var total = 0
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      total += count
      if (total > MAX_AVATAR_BYTES) return null
      output.write(buffer, 0, count)
    }
    return output.toByteArray()
  }

  companion object {
    private const val MESSAGE_CHANNEL_ID = "snsgod_messages"
    private const val DATA_NATIVE_CONVERSATION = "nativeConversation"
    private const val DATA_CHARACTER_NAME = "characterName"
    private const val DATA_MESSAGE_BODY = "messageBody"
    private const val DATA_AVATAR_URL = "avatarUrl"
    private const val DATA_ROOM_ID = "roomId"
    private const val DATA_MESSAGE_ID = "messageId"
    private const val MAX_NAME_LENGTH = 120
    private const val MAX_BODY_LENGTH = 140
    private const val MAX_ID_LENGTH = 512
    private const val MAX_SHORTCUT_LABEL_LENGTH = 40
    private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
    private const val NETWORK_TIMEOUT_MS = 4_000
  }
}
