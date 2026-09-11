import { supabase } from "@/lib/supabase";

/*
|--------------------------------------------------------------------------
| Advanced Notification Event System
|--------------------------------------------------------------------------
| File ini disimpan untuk arsitektur notification event yang lebih besar.
| Untuk notifikasi simpel saat ini, project masih aman memakai:
|
|   lib/createNotification.ts
|
| File ini cocok dipakai nanti untuk:
| - Support ticket event
| - Announcement broadcast
| - Wallet event
| - Withdrawal event
| - Seller approval event
| - Coupon event
| - Admin event logging
|--------------------------------------------------------------------------
*/

type NotificationPayload = {
  title: string;
  message: string;
  link?: string | null;
};

type EventLogPayload = {
  event_key: string;

  actor_id?: string | null;
  target_user_id: string;

  related_order_id?: number | null;
  related_product_id?: number | null;
  related_ticket_id?: number | null;
  related_announcement_id?: number | null;

  payload?: Record<string, unknown>;
};

export async function createEventNotification(
  userId: string,
  notification: NotificationPayload
) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      type: "event",
      title: notification.title,
      message: notification.message,
      link_url: notification.link || null,
      is_read: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Notification create error:", error.message);
    return null;
  }

  return data;
}

export async function logNotificationEvent(
  event: EventLogPayload,
  notificationId?: number | null,
  status: "created" | "failed" | "skipped" = "created",
  errorMessage?: string | null
) {
  try {
    await supabase.from("notification_event_logs").insert({
      event_key: event.event_key,
      actor_id: event.actor_id || null,
      target_user_id: event.target_user_id,
      related_order_id: event.related_order_id || null,
      related_product_id: event.related_product_id || null,
      related_ticket_id: event.related_ticket_id || null,
      related_announcement_id: event.related_announcement_id || null,
      payload: event.payload || {},
      notification_id: notificationId || null,
      status,
      error_message: errorMessage || null,
    });
  } catch (error) {
    console.error("Notification event log error:", error);
  }
}

export async function dispatchNotificationEvent(
  event: EventLogPayload,
  notification: NotificationPayload
) {
  try {
    const createdNotification = await createEventNotification(
      event.target_user_id,
      notification
    );

    if (!createdNotification) {
      await logNotificationEvent(
        event,
        null,
        "failed",
        "Failed creating notification."
      );

      return false;
    }

    await logNotificationEvent(event, createdNotification.id, "created");

    return true;
  } catch (error) {
    await logNotificationEvent(
      event,
      null,
      "failed",
      error instanceof Error ? error.message : "Unknown error"
    );

    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                               SUPPORT TICKETS                              */
/* -------------------------------------------------------------------------- */

export async function notifyAdminSupportCreated(params: {
  adminIds: string[];
  actorId: string;
  userEmail: string;
  ticketId: number;
  subject: string;
}) {
  for (const adminId of params.adminIds) {
    await dispatchNotificationEvent(
      {
        event_key: "support.ticket.created",
        actor_id: params.actorId,
        target_user_id: adminId,
        related_ticket_id: params.ticketId,
        payload: params,
      },
      {
        title: "New Support Ticket",
        message: `${params.userEmail} created support ticket #${params.ticketId}: ${params.subject}`,
        link: "/admin/support",
      }
    );
  }
}

export async function notifyUserSupportReply(params: {
  adminId: string;
  userId: string;
  ticketId: number;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "support.ticket.replied_by_admin",
      actor_id: params.adminId,
      target_user_id: params.userId,
      related_ticket_id: params.ticketId,
      payload: params,
    },
    {
      title: "Support Ticket Updated",
      message: `Admin replied to your support ticket #${params.ticketId}.`,
      link: `/support/${params.ticketId}`,
    }
  );
}

export async function notifyAdminSupportReply(params: {
  adminIds: string[];
  actorId: string;
  ticketId: number;
  userEmail: string;
}) {
  for (const adminId of params.adminIds) {
    await dispatchNotificationEvent(
      {
        event_key: "support.ticket.replied_by_user",
        actor_id: params.actorId,
        target_user_id: adminId,
        related_ticket_id: params.ticketId,
        payload: params,
      },
      {
        title: "Support Ticket Reply",
        message: `${params.userEmail} replied to support ticket #${params.ticketId}.`,
        link: `/support/${params.ticketId}`,
      }
    );
  }
}

export async function notifyUserSupportStatusChanged(params: {
  adminId: string;
  userId: string;
  ticketId: number;
  status: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "support.ticket.status_changed",
      actor_id: params.adminId,
      target_user_id: params.userId,
      related_ticket_id: params.ticketId,
      payload: params,
    },
    {
      title: "Support Ticket Status Updated",
      message: `Your support ticket #${params.ticketId} status is now ${params.status}.`,
      link: `/support/${params.ticketId}`,
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                                ANNOUNCEMENT                                */
/* -------------------------------------------------------------------------- */

export async function notifyAnnouncementPublished(params: {
  actorId: string;
  announcementId: number;
  title: string;
  slug: string;
}) {
  const { data: users, error } = await supabase.from("profiles").select("id");

  if (error) {
    console.error("Announcement notification user fetch error:", error.message);
    return;
  }

  if (!users) return;

  for (const user of users) {
    await dispatchNotificationEvent(
      {
        event_key: "announcement.published",
        actor_id: params.actorId,
        target_user_id: user.id,
        related_announcement_id: params.announcementId,
        payload: params,
      },
      {
        title: "New Announcement",
        message: params.title,
        link: `/announcements/${params.slug}`,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                   WALLET                                   */
/* -------------------------------------------------------------------------- */

export async function notifyWalletTopupApproved(params: {
  userId: string;
  amount: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "wallet.topup.approved",
      target_user_id: params.userId,
      payload: params,
    },
    {
      title: "Wallet Top Up Approved",
      message: `${params.amount} has been added to your wallet.`,
      link: "/wallet/topup",
    }
  );
}

export async function notifyWalletTopupRejected(params: {
  userId: string;
  amount: string;
  reason?: string | null;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "wallet.topup.rejected",
      target_user_id: params.userId,
      payload: params,
    },
    {
      title: "Wallet Top Up Rejected",
      message: params.reason
        ? `Your top up request of ${params.amount} was rejected. ${params.reason}`
        : `Your top up request of ${params.amount} was rejected.`,
      link: "/wallet/topup",
    }
  );
}

export async function notifyWithdrawalApproved(params: {
  userId: string;
  amount: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "wallet.withdrawal.approved",
      target_user_id: params.userId,
      payload: params,
    },
    {
      title: "Withdrawal Approved",
      message: `Your withdrawal request of ${params.amount} has been approved.`,
      link: "/wallet",
    }
  );
}

export async function notifyWithdrawalRejected(params: {
  userId: string;
  amount: string;
  reason?: string | null;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "wallet.withdrawal.rejected",
      target_user_id: params.userId,
      payload: params,
    },
    {
      title: "Withdrawal Rejected",
      message: params.reason
        ? `Your withdrawal request of ${params.amount} was rejected. ${params.reason}`
        : `Your withdrawal request of ${params.amount} was rejected.`,
      link: "/wallet",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                                   ORDER                                    */
/* -------------------------------------------------------------------------- */

export async function notifyBuyerOrderCreated(params: {
  buyerId: string;
  orderId: number;
  productTitle: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "order.created.buyer",
      target_user_id: params.buyerId,
      related_order_id: params.orderId,
      payload: params,
    },
    {
      title: "Order Created",
      message: `Your order #${params.orderId} for ${params.productTitle} has been created.`,
      link: `/order/${params.orderId}`,
    }
  );
}

export async function notifySellerNewOrder(params: {
  sellerId: string;
  buyerEmail?: string | null;
  orderId: number;
  productTitle: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "order.created.seller",
      target_user_id: params.sellerId,
      related_order_id: params.orderId,
      payload: params,
    },
    {
      title: "New Order Received",
      message: `${params.buyerEmail || "A buyer"} created order #${
        params.orderId
      } for ${params.productTitle}.`,
      link: "/seller/orders",
    }
  );
}

export async function notifyBuyerOrderStatusChanged(params: {
  buyerId: string;
  orderId: number;
  status: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "order.status_changed.buyer",
      target_user_id: params.buyerId,
      related_order_id: params.orderId,
      payload: params,
    },
    {
      title: `Order ${params.status}`,
      message: `Your order #${params.orderId} status is now ${params.status}.`,
      link:
        params.status === "Completed"
          ? `/review/${params.orderId}`
          : `/order/${params.orderId}`,
    }
  );
}

export async function notifySellerEarningReleased(params: {
  sellerId: string;
  orderId: number;
  amount: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "seller.earning.released",
      target_user_id: params.sellerId,
      related_order_id: params.orderId,
      payload: params,
    },
    {
      title: "Seller Earning Released",
      message: `${params.amount} has been added to your wallet from completed order #${params.orderId}.`,
      link: "/wallet",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                               SELLER SYSTEM                                */
/* -------------------------------------------------------------------------- */

export async function notifySellerApproved(userId: string) {
  await dispatchNotificationEvent(
    {
      event_key: "seller.application.approved",
      target_user_id: userId,
    },
    {
      title: "Seller Application Approved",
      message: "Congratulations! Your seller application has been approved.",
      link: "/seller",
    }
  );
}

export async function notifySellerRejected(userId: string, reason?: string) {
  await dispatchNotificationEvent(
    {
      event_key: "seller.application.rejected",
      target_user_id: userId,
      payload: {
        reason,
      },
    },
    {
      title: "Seller Application Rejected",
      message: reason
        ? `Your seller application was rejected. ${reason}`
        : "Your seller application was rejected.",
      link: "/seller/apply",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                                   COUPON                                   */
/* -------------------------------------------------------------------------- */

export async function notifyCouponUsed(params: {
  userId: string;
  couponCode: string;
  discountAmount: string;
}) {
  await dispatchNotificationEvent(
    {
      event_key: "coupon.used",
      target_user_id: params.userId,
      payload: params,
    },
    {
      title: "Coupon Applied",
      message: `Coupon ${params.couponCode} saved you ${params.discountAmount}.`,
      link: "/my-orders",
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                               ADMIN UTILITIES                              */
/* -------------------------------------------------------------------------- */

export async function getAdminIds() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
    console.error("Get admin ids error:", error.message);
    return [];
  }

  return (data || []).map((item) => item.id);
}