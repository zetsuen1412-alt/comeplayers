package com.comeplayers.playupdates

import android.app.Activity
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ComePlayersPlayUpdatesModule : Module() {
  private var updateManager: AppUpdateManager? = null
  private var installListener: InstallStateUpdatedListener? = null

  private fun manager(): AppUpdateManager? {
    updateManager?.let { return it }
    val context = appContext.reactContext ?: return null
    return AppUpdateManagerFactory.create(context).also { updateManager = it }
  }

  private fun unregisterInstallListener() {
    val manager = updateManager ?: return
    installListener?.let(manager::unregisterListener)
    installListener = null
  }

  private fun registerFlexibleInstallListener(manager: AppUpdateManager) {
    if (installListener != null) return

    val listener = InstallStateUpdatedListener { state ->
      when (state.installStatus()) {
        InstallStatus.DOWNLOADED -> {
          manager.completeUpdate()
        }
        InstallStatus.CANCELED,
        InstallStatus.FAILED,
        InstallStatus.INSTALLED -> unregisterInstallListener()
      }
    }
    installListener = listener
    manager.registerListener(listener)
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
          if (info.installStatus() == InstallStatus.DOWNLOADED) {
            manager.completeUpdate()
            resolve(
              promise,
              status = "completing",
              availableVersionCode = info.availableVersionCode()
            )
            return@addOnSuccessListener
          }

          val availability = info.updateAvailability()
          if (
            availability != UpdateAvailability.UPDATE_AVAILABLE &&
            availability != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
          ) {
            resolve(promise, "up_to_date")
            return@addOnSuccessListener
          }

          val staleDays = info.clientVersionStalenessDays() ?: 0
          val highPriority = info.updatePriority() >= 4 || staleDays >= 7
          val updateType = when {
            highPriority && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) ->
              AppUpdateType.IMMEDIATE
            info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) ->
              AppUpdateType.FLEXIBLE
            info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) ->
              AppUpdateType.IMMEDIATE
            else -> null
          }

          if (updateType == null) {
            resolve(
              promise,
              status = "not_allowed",
              availableVersionCode = info.availableVersionCode()
            )
            return@addOnSuccessListener
          }

          val mode =
            if (updateType == AppUpdateType.IMMEDIATE) "immediate" else "flexible"
          if (updateType == AppUpdateType.FLEXIBLE) {
            registerFlexibleInstallListener(manager)
          }

          val options = AppUpdateOptions.newBuilder(updateType).build()
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
                  unregisterInstallListener()
                  resolve(
                    promise,
                    status = "cancelled",
                    mode = mode,
                    availableVersionCode = info.availableVersionCode()
                  )
                }
                ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> {
                  unregisterInstallListener()
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
              unregisterInstallListener()
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

    OnDestroy {
      unregisterInstallListener()
    }
  }
}
