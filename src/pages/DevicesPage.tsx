import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import { IconActivity, IconArrowRight, IconSearch } from "@/assets/Icons";
import { useDevices } from "@/api/devices";
import { useBindDevice } from "@/api/mutations";
import type { Device } from "@/api/types";
import { EmptyState } from "@/components/EmptyState";
import { QueryError } from "@/components/QueryError";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";

export function DevicesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const query = useDevices({ search: search || undefined });
  const devices = query.data ?? [];
  const bind = useBindDevice();
  const [binding, setBinding] = useState(false);
  const [serial, setSerial] = useState("");

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  function onBind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = serial.trim();
    if (!value) return;
    bind.mutate(value, {
      onSuccess: () => {
        setSerial("");
        setBinding(false);
      },
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Devices
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Devices you own or that are shared with you through a context.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setBinding((open) => !open)}
        >
          Bind device
        </button>
      </header>

      {binding ? (
        <form
          className="surface flex flex-wrap items-end gap-3 p-4"
          onSubmit={onBind}
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="bind-serial"
              className="mb-1.5 block text-xs font-medium text-fg-muted"
            >
              Serial number
            </label>
            <input
              id="bind-serial"
              className="field"
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              placeholder="e.g. 00001"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={bind.isPending || serial.trim().length === 0}
          >
            {bind.isPending ? <Spinner /> : "Bind"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setBinding(false)}
          >
            Cancel
          </button>
          {bind.isError ? (
            <p className="w-full text-xs text-red-500">
              {bind.error instanceof Error
                ? bind.error.message
                : "Could not bind the device."}
            </p>
          ) : null}
        </form>
      ) : null}

      <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={onSearch}>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, serial or assigned name"
            className="field pl-9"
            aria-label="Search devices"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      {query.isError ? (
        <QueryError error={query.error} label="devices" />
      ) : query.isPending ? (
        <ListSkeleton />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<IconActivity className="h-5 w-5" />}
          title="No devices found"
          description="Bind a device in the RRIV app or CLI to see it here."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceRow key={device.id} device={device} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const placement = device.DeviceContext?.[0];
  const eui = device.DeviceEuis?.[0]?.eui;

  return (
    <li>
      <Link
        to={`/devices/${device.id}`}
        className="surface surface-interactive flex h-full flex-col justify-between gap-4 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">
              {device.uniqueName}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-fg-subtle">
              {device.serialNumber}
            </p>
          </div>
          <IconArrowRight className="h-4 w-4 shrink-0 text-fg-subtle" />
        </div>

        <div className="space-y-1.5 text-xs text-fg-subtle">
          <p className="truncate">
            {placement
              ? `${placement.Context.name} · ${placement.assignedDeviceName}`
              : "Unassigned"}
          </p>
          <p className="truncate">
            {eui ? (
              <span className="font-mono">{eui}</span>
            ) : (
              "No EUI registered"
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="surface space-y-3 p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}
