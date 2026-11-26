package expo.modules.applock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

private const val CHANNEL = "forma-app-lock"
private const val NOTIFICATION_ID = 4107
private const val POLL_MS = 700L

/**
 * Watches which app is on screen and covers a locked one with a full-screen
 * overlay unless a pass is running.
 */
class AppLockService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var store: LockStore
  private var overlay: View? = null
  private var foreground: String? = null
  private var lastQuery = 0L
  private var shownText = ""

  private val tick = object : Runnable {
    override fun run() {
      check()
      handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = LockStore(this)
    // look back far enough to know what is already on screen
    lastQuery = System.currentTimeMillis() - 60 * 60_000L
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "App lock", NotificationManager.IMPORTANCE_LOW))
    }
    shownText = statusText()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification(shownText), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification(shownText))
    }
    if (!store.enabled) {
      stopSelf()
      return START_NOT_STICKY
    }
    handler.removeCallbacks(tick)
    handler.post(tick)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    hideOverlay()
    super.onDestroy()
  }

  private fun check() {
    if (!(getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive) return
    updateNotification()
    readForeground()
    val current = foreground
    val locked = current != null && current != packageName && current in store.blocked && store.remainingMs() == 0L
    if (locked && canLock(this)) showOverlay() else hideOverlay()
  }

  private fun readForeground() {
    val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val now = System.currentTimeMillis()
    // overlap the previous window: events can be recorded slightly late
    val events = usage.queryEvents(lastQuery - 2_000, now) ?: return
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      // MOVE_TO_FOREGROUND is the same value as ACTIVITY_RESUMED and exists on older versions
      @Suppress("DEPRECATION")
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground = event.packageName
    }
    lastQuery = now
  }

  private fun statusText(): String {
    val left = store.remainingMs()
    return if (left > 0) "Unlocked for ${(left + 59_999) / 60_000} more min" else "Your chosen apps are locked"
  }

  private fun updateNotification() {
    val text = statusText()
    if (text == shownText) return
    shownText = text
    getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text))
  }

  private fun openFormaIntent() = Intent(Intent.ACTION_VIEW, Uri.parse("forma://app-lock"))
    .setPackage(packageName)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

  private fun notification(text: String): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    return builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setContentTitle("Forma app lock")
      .setContentText(text)
      .setOngoing(true)
      .setContentIntent(PendingIntent.getActivity(this, 0, openFormaIntent(), PendingIntent.FLAG_IMMUTABLE))
      .build()
  }

  private fun showOverlay() {
    if (overlay != null) return
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    fun label(content: String, size: Float, color: Int) = TextView(this).apply {
      text = content
      textSize = size
      setTextColor(color)
      gravity = Gravity.CENTER
      setPadding(0, 0, 0, dp(12))
    }

    fun button(content: String, onClick: () -> Unit) = Button(this).apply {
      text = content
      isAllCaps = false
      setOnClickListener { onClick() }
    }

    val view = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#170D17"))
      setPadding(dp(32), dp(32), dp(32), dp(32))
      addView(label("Locked by Forma", 24f, Color.WHITE))
      addView(label("Spend coins on a pass to open this app.", 16f, Color.LTGRAY))
      addView(button("Get a pass") { startActivity(openFormaIntent()) })
      addView(button("Close") {
        startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      })
    }
    @Suppress("DEPRECATION")
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.OPAQUE
    )
    getSystemService(WindowManager::class.java).addView(view, params)
    overlay = view
  }

  private fun hideOverlay() {
    overlay?.let { getSystemService(WindowManager::class.java).removeView(it) }
    overlay = null
  }
}
