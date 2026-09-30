import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./client";
import type { AccountRef, Context, Device, DeviceContext } from "./types";

/**
 * Cloud-only mutations. Nothing here talks to a board: no provisioning, no EUI
 * registration, no firmware flashing, and no setting of the applied config.
 */

function useInvalidators() {
  const client = useQueryClient();
  return {
    contexts: () => client.invalidateQueries({ queryKey: ["contexts"] }),
    devices: () => client.invalidateQueries({ queryKey: ["devices"] }),
  };
}

/* ----------------------------------------------------------------- Contexts */

export function useCreateContext() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      api.post<Context>("/context", body),
    onSuccess: () => invalidate.contexts(),
  });
}

export function useUpdateContext() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; end?: true };
    }) => api.patch<Context>(`/context/${id}`, body),
    onSuccess: () => invalidate.contexts(),
  });
}

export function useDeleteContext() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: (id: string) => api.delete<Context>(`/context/${id}`),
    onSuccess: () => invalidate.contexts(),
  });
}

/** Owner-only: accounts a context has been shared with. */
export function useContextRecipients(contextId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["context", contextId ?? "", "share"],
    queryFn: ({ signal }) =>
      api.get<AccountRef[]>(`/context/${contextId}/share`, { signal }),
    enabled: Boolean(contextId),
  });
}

export function useShareContext() {
  const api = useApiClient();
  const client = useQueryClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.post<void>(`/context/${id}/share`, { email }),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: ["context", variables.id, "share"],
      });
      invalidate.contexts();
    },
  });
}

/* ------------------------------------------------------------ DeviceContext */

export function useCreateDeviceContext() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: ({
      contextId,
      deviceId,
      assignedDeviceName,
    }: {
      contextId: string;
      deviceId: string;
      assignedDeviceName: string;
    }) =>
      api.post<DeviceContext>(`/context/${contextId}/device/${deviceId}`, {
        assignedDeviceName,
      }),
    onSuccess: () => {
      invalidate.contexts();
      invalidate.devices();
    },
  });
}

export function useUpdateDeviceContext() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: ({
      contextId,
      deviceId,
      body,
    }: {
      contextId: string;
      deviceId: string;
      body: { assignedDeviceName?: string; end?: true };
    }) =>
      api.patch<DeviceContext>(
        `/context/${contextId}/device/${deviceId}`,
        body,
      ),
    onSuccess: () => {
      invalidate.contexts();
      invalidate.devices();
    },
  });
}

/* ------------------------------------------------------------------ Devices */

export function useBindDevice() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: (serialNumber: string) =>
      api.post<Device>(`/device/${serialNumber}/bind`),
    onSuccess: () => invalidate.devices(),
  });
}

export function useUnbindDevice() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: (serialNumber: string) =>
      api.post<Device>(`/device/${serialNumber}/unbind`),
    onSuccess: () => invalidate.devices(),
  });
}

export function useDeleteDevice() {
  const api = useApiClient();
  const invalidate = useInvalidators();
  return useMutation({
    mutationFn: (serialNumber: string) =>
      api.delete<Device>(`/device/${serialNumber}`),
    onSuccess: () => invalidate.devices(),
  });
}

export function useCreateDeviceLog() {
  const api = useApiClient();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, log }: { identifier: string; log: string }) =>
      api.post<void>("/device/log", { identifier, log }),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({
        queryKey: ["device-log", variables.identifier],
      });
    },
  });
}

export function useSendCommand() {
  const api = useApiClient();
  return useMutation({
    mutationFn: ({
      identifier,
      command,
    }: {
      identifier: string;
      command: string;
    }) =>
      api.post<{ responseId?: string }>("/device/sendCommand", {
        identifier,
        command,
      }),
  });
}

/* ---------------------------------------------------------------- Snapshots */

export function useSaveSnapshot() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      deviceId: string;
      contextId: string;
    }) => api.post<void>("/configSnapshot/save", body),
  });
}
