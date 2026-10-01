package com.comeplayers.playupdates

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ComePlayersPlayUpdatesModule : Module() {
  private var updateManager: AppUpdateManager? = null

  private fun manager(): AppUpdateManager? {
    updateManager?.let { return it }
    val context = appContext.reactContext ?: return null
    return AppUpdateManagerFactory.create(context).also { updateManager = it }
  }

  private fun resolve(
    promise: Promise,
    status: String,
    mode: String? = null,
    availableVersionCode: Int? = null
  ) {
    promise.resolve(
      mapOf(
        "status" to status,
        "mode" to mode,
        "availableVersionCode" to availableVersionCode
      )
    )
  }

  override fun definition() = ModuleDefinition {
    Name("ComePlayersPlayUpdates")

    AsyncFunction("checkAndStartUpdateAsync") { promise: Promise ->
      val manager = manager()
      val activity = appContext.activityProvider?.currentActivity
      if (manager == null || activity == null) {
        resolve(promise, "unavailable")
        return@AsyncFunction
      }

      manager.appUpdateInfo
        .addOnSuccessListener { info ->
          val availability = info.updateAvailability()
          if (
            availability != UpdateAvailability.UPDATE_AVAILABLE &&
            availability != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
          ) {
            resolve(promise, "up_to_date")
            return@addOnSuccessListener
          }

          // Google requests consent and keeps its progress UI in the foreground
          // until installation finishes. Never complete a background download
          // while the user may have returned to a draft or an active call.
          if (!info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
            resolve(
              promise,
              status = "not_allowed",
              availableVersionCode = info.availableVersionCode()
            )
            return@addOnSuccessListener
          }

          val mode = "immediate"
          val options = AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
          manager.startUpdateFlow(info, activity, options)
            .addOnSuccessListener { resultCode ->
              when (resultCode) {
                Activity.RESULT_OK -> resolve(
                  promise,
                  status = "accepted",
                  mode = mode,
                  availableVersionCode = info.availableVersionCode()
                )
                Activity.RESULT_CANCELED -> {
                  resolve(
                    promise,
                    status = "cancelled",
                    mode = mode,
                    availableVersionCode = info.availableVersionCode()
                  )
                }
                ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> {
                  resolve(
                    promise,
                    status = "failed",
                    mode = mode,
                    availableVersionCode = info.availableVersionCode()
                  )
                }
                else -> resolve(
                  promise,
                  status = "closed",
                  mode = mode,
                  availableVersionCode = info.availableVersionCode()
                )
              }
            }
            .addOnFailureListener {
              resolve(
                promise,
                status = "failed",
                mode = mode,
                availableVersionCode = info.availableVersionCode()
              )
            }
        }
        .addOnFailureListener {
          // Expected for sideloaded/debug builds or devices without Google Play.
          resolve(promise, "unavailable")
        }
    }.runOnQueue(Queues.MAIN)
  }
}
