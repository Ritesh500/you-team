import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination.js';

export const employeeStatusEnum = z.enum([
  'ACTIVE',
  'PROBATION',
  'ON_LEAVE',
  'NOTICE_PERIOD',
  'RESIGNED',
  'TERMINATED',
]);

export const employmentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
  'FREELANCE',
]);

export const genderEnum = z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']);

export const salesChannelEnum = z.enum(['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA']);

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .or(z.date().transform((d) => d.toISOString().slice(0, 10)));

const optionalText = z
  .string()
  .trim()
  .max(255)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const channelAssignmentInputSchema = z.object({
  channel: salesChannelEnum,
  allocationPct: z.coerce.number().int().min(1).max(100).default(100),
  isPrimary: z.boolean().default(false),
  channelRole: optionalText,
});

export const createEmployeeSchema = z
  .object({
    employeeCode: z
      .string()
      .trim()
      .min(2, 'Employee code is required')
      .max(24)
      .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and hyphens only')
      .transform((value) => value.toUpperCase()),
    firstName: z.string().trim().min(1, 'First name is required').max(80),
    lastName: z.string().trim().min(1, 'Last name is required').max(80),
    workEmail: z.string().trim().toLowerCase().email('Enter a valid work email'),
    personalEmail: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
    phone: z
      .string()
      .trim()
      .min(6, 'Enter a valid phone number')
      .max(20)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    avatarUrl: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),

    gender: genderEnum.default('UNDISCLOSED'),
    dateOfBirth: dateOnly.optional(),

    addressLine: optionalText,
    city: optionalText,
    state: optionalText,
    country: z.string().trim().max(80).default('India'),

    designation: z.string().trim().min(2, 'Designation is required').max(120),
    employmentType: employmentTypeEnum.default('FULL_TIME'),
    status: employeeStatusEnum.default('ACTIVE'),
    joiningDate: dateOnly,
    exitDate: dateOnly.optional(),

    ctcAnnual: z.coerce.number().min(0, 'CTC cannot be negative').max(1_000_000_000).default(0),

    departmentId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),
    managerId: z.string().cuid().optional().or(z.literal('').transform(() => undefined)),

    channels: z.array(channelAssignmentInputSchema).max(4).default([]),

    /** When true, a login is created for this employee. */
    createLogin: z.boolean().default(false),
    loginRole: z.enum(['HR_MANAGER', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
    /** Required when `createLogin` is true. */
    password: z.string().min(8, 'Use at least 8 characters').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.createLogin && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'A password is required when creating a login',
      });
    }

    if (value.exitDate && value.exitDate < value.joiningDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exitDate'],
        message: 'Exit date cannot be before the joining date',
      });
    }

    const channels = value.channels.map((channel) => channel.channel);
    if (new Set(channels).size !== channels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channels'],
        message: 'Each sales channel can only be assigned once',
      });
    }

    if (value.channels.filter((channel) => channel.isPrimary).length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['channels'],
        message: 'Only one channel can be marked primary',
      });
    }
  });

/**
 * Update accepts the same fields, all optional. Built from the inner object so
 * `.partial()` is available (ZodEffects from superRefine is not partial-able).
 */
export const updateEmployeeSchema = createEmployeeSchema.innerType()
  .omit({ createLogin: true, loginRole: true, password: true })
  .partial();

export const listEmployeesSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  departmentId: z.string().cuid().optional(),
  managerId: z.string().cuid().optional(),
  status: employeeStatusEnum.optional(),
  employmentType: employmentTypeEnum.optional(),
  channel: salesChannelEnum.optional(),
  sortBy: z.enum(['name', 'joiningDate', 'employeeCode', 'ctcAnnual']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export const employeeIdParamSchema = z.object({
  id: z.string().cuid('Not a valid employee id'),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesSchema>;
