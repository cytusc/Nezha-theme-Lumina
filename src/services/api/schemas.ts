import { z } from "zod";
import { LoadRecordSchema } from "@/types/monitor";

export const ApiEnvelope = <T extends z.ZodTypeAny>(inner: T) =>
  z
    .object({
      success: z.boolean().default(true),
      data: inner.optional(),
      error: z.string().optional(),
    })
    .passthrough();

export const NezhaHostSchema = z
  .object({
    platform: z.string().default(""),
    platform_version: z.string().default(""),
    cpu: z.array(z.string()).default([]),
    mem_total: z.number().default(0),
    disk_total: z.number().default(0),
    swap_total: z.number().default(0),
    arch: z.string().default(""),
    virtualization: z.string().default(""),
    version: z.string().default(""),
    gpu: z.array(z.string()).default([]),
  })
  .passthrough();

export const NezhaStateSchema = z
  .object({
    cpu: z.number().default(0),
    mem_used: z.number().default(0),
    swap_used: z.number().default(0),
    disk_used: z.number().default(0),
    net_in_transfer: z.number().default(0),
    net_out_transfer: z.number().default(0),
    net_in_speed: z.number().default(0),
    net_out_speed: z.number().default(0),
    uptime: z.number().default(0),
    load_1: z.number().default(0),
    load_5: z.number().default(0),
    load_15: z.number().default(0),
    tcp_conn_count: z.number().default(0),
    udp_conn_count: z.number().default(0),
    process_count: z.number().default(0),
  })
  .passthrough();

export const NezhaStreamServerSchema = z
  .object({
    id: z.number(),
    name: z.string().default(""),
    public_note: z.string().default(""),
    display_index: z.number().default(0),
    host: NezhaHostSchema.nullish(),
    state: NezhaStateSchema.nullish(),
    country_code: z.string().default(""),
    last_active: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();

export const NezhaWsPayloadSchema = z
  .object({
    now: z.number().default(0),
    online: z.number().default(0),
    servers: z.array(NezhaStreamServerSchema).default([]),
  })
  .passthrough();

export const PingOverviewItemSchema = z
  .object({
    client: z.string().default(""),
    isAssigned: z.boolean().default(false),
    lastValue: z.number().nullable().default(null),
    values: z.array(z.number()).default([]),
    samples: z
      .array(
        z
          .object({
            time: z.number().default(0),
            value: z.number().default(0),
          })
          .passthrough(),
      )
      .default([]),
    max: z.number().default(1),
    loss: z.number().nullable().default(null),
  })
  .passthrough();

export const PingOverviewMapSchema = z.record(PingOverviewItemSchema).default({});

export const HomeBootstrapSchema = z
  .object({
    snapshot: NezhaWsPayloadSchema,
    ping_overviews: PingOverviewMapSchema,
  })
  .passthrough();

export const LoadRecordsResponseSchema = z
  .object({
    count: z.number().default(0),
    records: z.array(LoadRecordSchema).default([]),
  })
  .passthrough();

export const NezhaMetricPointSchema = z
  .object({
    ts: z.number(),
    value: z.number().default(0),
  })
  .passthrough();

export const NezhaServerMetricsSchema = z
  .object({
    server_id: z.number(),
    server_name: z.string().default(""),
    metric: z.string().default(""),
    data_points: z.array(NezhaMetricPointSchema).default([]),
  })
  .passthrough();

export const NezhaServiceInfoSchema = z
  .object({
    monitor_id: z.number(),
    server_id: z.number(),
    monitor_name: z.string().default(""),
    server_name: z.string().default(""),
    display_index: z.number().default(0),
    created_at: z.array(z.number()).default([]),
    avg_delay: z.array(z.number()).default([]),
  })
  .passthrough();

export const NezhaSettingSchema = z
  .object({
    config: z
      .object({
        site_name: z.string().default(""),
        custom_code: z.string().default(""),
        custom_code_dashboard: z.string().default(""),
        user_template: z.string().default(""),
        oauth2_providers: z.array(z.string()).default([]),
      })
      .passthrough()
      .default({}),
    version: z.string().default(""),
    frontend_templates: z.array(z.unknown()).default([]),
    tsdb_enabled: z.boolean().default(false),
  })
  .passthrough();

export const NezhaProfileSchema = z
  .object({
    user: z
      .object({
        id: z.number().optional(),
        username: z.string().default(""),
      })
      .passthrough(),
  })
  .passthrough();

export type NezhaStreamServer = z.infer<typeof NezhaStreamServerSchema>;
export type HomeBootstrapPayload = z.infer<typeof HomeBootstrapSchema>;
export type NezhaServiceInfo = z.infer<typeof NezhaServiceInfoSchema>;
