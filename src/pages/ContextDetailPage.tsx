import { Link, useParams } from "react-router";
import { IconActivity, IconArrowLeft, IconArrowRight } from "@/assets/Icons";
import { useContexts } from "@/api/contexts";
import { useDevices } from "@/api/devices";
import { useUpdateDeviceContext } from "@/api/mutations";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/Badge";
import {
  AddDeviceToContext,
  ContextHeaderActions,
  ContextSharing,
} from "@/components/ContextControls";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { SectionCard } from "@/components/SectionCard";
import { Skeleton } from "@/components/Skeleton";
import { formatDate } from "@/lib/format";

export function ContextDetailPage() {
  const { contextId } = useParams<{ contextId: string }>();
  const { user } = useAuth();
  const endPlacement = useUpdateDeviceContext();

  const contextsQuery = useContexts({ limit: 100 });
  const context =
    (contextsQuery.data ?? []).find((item) => item.id === contextId) ?? null;

  const devicesQuery = useDevices({ contextId });
  const devices = devicesQuery.data ?? [];
  const owned = context?.Account?.id === user?.profile?.sub;

  const backLink = (
    <Link
      to="/contexts"
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition hover:text-fg"
    >
      <IconArrowLeft className="h-4 w-4" />
      Back to contexts
    </Link>
  );

  if (contextsQuery.isError) {
    return (
      <div className="space-y-6">
        {backLink}
        <QueryError error={contextsQuery.error} label="this context" />
      </div>
    );
  }

  if (contextsQuery.isSuccess && !context) {
    return (
      <div className="space-y-6">
        {backLink}
        <EmptyState
          icon={<IconActivity className="h-5 w-5" />}
          title="Context not found"
          description="It may have been deleted, or you no longer have access."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {backLink}

      {context ? (
        <header className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                {context.name}
              </h1>
              <Badge tone={context.endedAt ? "neutral" : "success"}>
                {context.endedAt ? "ended" : "active"}
              </Badge>
              {!owned ? <Badge tone="brand">shared</Badge> : null}
            </div>
            <ContextHeaderActions context={context} owned={owned} />
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <MetaCell
              label="Owner"
              value={context.Account?.email ?? "Unknown"}
            />
            <MetaCell label="Started" value={formatDate(context.startedAt)} />
            <MetaCell
              label="Ended"
              value={context.endedAt ? formatDate(context.endedAt) : "—"}
            />
          </dl>
        </header>
      ) : (
        <Skeleton className="h-7 w-1/3" />
      )}

      {context && owned ? (
        <ContextSharing contextId={context.id} owned={owned} />
      ) : null}

      <SectionCard
        title="Devices"
        subtitle="Devices assigned to this context"
        action={<Badge tone="neutral">{devices.length} total</Badge>}
      >
        {devicesQuery.isError ? (
          <QueryError error={devicesQuery.error} label="devices" />
        ) : devicesQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<IconActivity className="h-5 w-5" />}
            title="No devices in this context"
            description="Add an unassigned device below."
          />
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((device) => (
              <li
                key={device.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <Link
                  to={`/devices/${device.id}`}
                  className="-mx-2 flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition hover:bg-surface-2/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {device.DeviceContext?.[0]?.assignedDeviceName ??
                        device.uniqueName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fg-subtle">
                      {device.uniqueName} ·{" "}
                      <span className="font-mono">{device.serialNumber}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {device.DeviceEuis?.[0]?.eui ? (
                      <span className="hidden font-mono text-xs text-fg-subtle sm:block">
                        {device.DeviceEuis[0].eui}
                      </span>
                    ) : null}
                    <IconArrowRight className="h-4 w-4 text-fg-subtle" />
                  </div>
                </Link>
                {owned && context && !context.endedAt ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-fg-subtle transition hover:text-red-500"
                    disabled={endPlacement.isPending}
                    onClick={() =>
                      endPlacement.mutate({
                        contextId: context.id,
                        deviceId: device.id,
                        body: { end: true },
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {context && !context.endedAt ? (
          <div className="mt-5 border-t border-border pt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">
              Add a device
            </p>
            <AddDeviceToContext contextId={context.id} />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-fg">{value}</dd>
    </div>
  );
}
