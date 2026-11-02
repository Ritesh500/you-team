import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Search, UserPlus, Users, X } from 'lucide-react';
import { useDepartments, useEmployee, useEmployees, type EmployeeFilters } from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import { cn, debounce, formatCompactCurrency, formatDate, humanizeEnum } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Card } from '@/components/ui/Card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PersonCell } from '@/components/ui/Avatar';
import { ChannelChip, EmployeeStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/States';
import { Pagination } from '@/components/ui/Pagination';
import { EmployeeFormModal } from './employees/EmployeeFormModal';
import type { EmployeeListItem, SalesChannel } from '@/types/api';

const STATUS_OPTIONS = [
  'ACTIVE',
  'PROBATION',
  'ON_LEAVE',
  'NOTICE_PERIOD',
  'RESIGNED',
  'TERMINATED',
];

const CHANNEL_OPTIONS: SalesChannel[] = ['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA'];

const EMPLOYMENT_OPTIONS = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'FREELANCE'];

/** Card layout used instead of the table below `sm`. */
function EmployeeCard({
  employee,
  onOpen,
}: {
  employee: EmployeeListItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full border-b border-hairline px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-surface-sunken"
    >
      <div className="flex items-start justify-between gap-3">
        <PersonCell
          name={`${employee.firstName} ${employee.lastName}`}
          secondary={employee.designation}
          src={employee.avatarUrl}
        />
        <EmployeeStatusBadge status={employee.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div>
          <dt className="text-ink-muted">Code</dt>
          <dd className="tabular font-medium text-ink">{employee.employeeCode}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Department</dt>
          <dd className="truncate font-medium text-ink">{employee.department?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Joined</dt>
          <dd className="tabular font-medium text-ink">{formatDate(employee.joiningDate)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">CTC</dt>
          <dd className="tabular font-medium text-ink">
            {formatCompactCurrency(employee.ctcAnnual)}
          </dd>
        </div>
      </dl>

      {employee.channelAssignments.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {employee.channelAssignments.map((assignment) => (
            <ChannelChip
              key={assignment.channel}
              channel={assignment.channel}
              suffix={assignment.allocationPct < 100 ? `${assignment.allocationPct}%` : undefined}
            />
          ))}
        </div>
      )}
    </button>
  );
}

export function EmployeesPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<EmployeeFilters>(() => ({
    page: 1,
    pageSize: 20,
    search: searchParams.get('search') ?? undefined,
    departmentId: searchParams.get('departmentId') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    channel: searchParams.get('channel') ?? undefined,
    employmentType: searchParams.get('employmentType') ?? undefined,
    sortBy: searchParams.get('sortBy') ?? 'name',
    sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? 'asc',
  }));

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: editing } = useEmployee(editingId ?? undefined);
  const { data: departments } = useDepartments();
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useEmployees(filters);

  // Clear the `?new=1` trigger once the dialog has consumed it.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setFilters((previous) => ({ ...previous, search: value || undefined, page: 1 }));
      }, 350),
    [],
  );

  const setFilter = (key: keyof EmployeeFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value || undefined, page: 1 }));
  };

  const toggleSort = (column: 'name' | 'employeeCode' | 'joiningDate' | 'ctcAnnual') => {
    setFilters((previous) => ({
      ...previous,
      sortBy: column,
      sortDir: previous.sortBy === column && previous.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  };

  const activeFilterCount = [
    filters.search,
    filters.departmentId,
    filters.status,
    filters.channel,
    filters.employmentType,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchInput('');
    setFilters({ page: 1, pageSize: filters.pageSize, sortBy: 'name', sortDir: 'asc' });
  };

  const SortButton = ({
    column,
    children,
    align = 'left',
  }: {
    column: 'name' | 'employeeCode' | 'joiningDate' | 'ctcAnnual';
    children: string;
    align?: 'left' | 'right';
  }) => (
    <button
      type="button"
      onClick={() => toggleSort(column)}
      className={cn(
        // `uppercase` is repeated here because a <button> does not inherit the
        // <th>'s text-transform, which left sortable headers looking different.
        'inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-ink',
        filters.sortBy === column && 'text-ink',
        align === 'right' && 'flex-row-reverse',
      )}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" aria-hidden />
      <span className="sr-only">
        {filters.sortBy === column
          ? `sorted ${filters.sortDir === 'asc' ? 'ascending' : 'descending'}`
          : 'not sorted'}
      </span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Employees"
        description="The full roster, with each person's department, channel allocation and cost."
        actions={
          can.manageEmployees(role) ? (
            <Button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
              leadingIcon={<UserPlus className="h-4 w-4" aria-hidden />}
            >
              Add employee
            </Button>
          ) : undefined
        }
      />

      {/* Filters — one row above the table */}
      <div className="mb-4 grid gap-3 rounded-card border border-hairline bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Search name, code, email…"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            debouncedSearch(event.target.value);
          }}
          leadingIcon={<Search className="h-4 w-4" aria-hidden />}
          aria-label="Search employees"
          containerClassName="sm:col-span-2 lg:col-span-1"
        />

        <Select
          value={filters.departmentId ?? ''}
          onChange={(event) => setFilter('departmentId', event.target.value)}
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {(departments ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>

        <Select
          value={filters.status ?? ''}
          onChange={(event) => setFilter('status', event.target.value)}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {humanizeEnum(status)}
            </option>
          ))}
        </Select>

        <Select
          value={filters.channel ?? ''}
          onChange={(event) => setFilter('channel', event.target.value)}
          aria-label="Filter by sales channel"
        >
          <option value="">Any channel</option>
          {CHANNEL_OPTIONS.map((channel) => (
            <option key={channel} value={channel}>
              {humanizeEnum(channel)}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-2">
          <Select
            value={filters.employmentType ?? ''}
            onChange={(event) => setFilter('employmentType', event.target.value)}
            aria-label="Filter by employment type"
            containerClassName="flex-1"
          >
            <option value="">Any type</option>
            {EMPLOYMENT_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {humanizeEnum(type)}
              </option>
            ))}
          </Select>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearFilters}
              aria-label={`Clear ${activeFilterCount} filters`}
              title="Clear filters"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <Card className={cn('overflow-hidden transition-opacity', isPlaceholderData && 'opacity-60')}>
        {isLoading ? (
          <TableSkeleton rows={8} columns={6} />
        ) : isError ? (
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden />}
            title="No employees match these filters"
            description={
              activeFilterCount > 0
                ? 'Try widening the search or clearing a filter.'
                : 'Add your first employee to get started.'
            }
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : can.manageEmployees(role) ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  Add employee
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Phone: stacked cards */}
            <div className="sm:hidden">
              {data.data.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  onOpen={() => navigate(`/employees/${employee.id}`)}
                />
              ))}
            </div>

            {/* Tablet and up: table */}
            <TableWrap className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    <Th>
                      <SortButton column="name">Employee</SortButton>
                    </Th>
                    <Th className="hidden lg:table-cell">
                      <SortButton column="employeeCode">Code</SortButton>
                    </Th>
                    <Th>Department</Th>
                    <Th className="hidden xl:table-cell">Channels</Th>
                    <Th className="hidden md:table-cell">
                      <SortButton column="joiningDate">Joined</SortButton>
                    </Th>
                    <Th align="right" className="hidden lg:table-cell">
                      <SortButton column="ctcAnnual" align="right">
                        CTC
                      </SortButton>
                    </Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((employee) => (
                    <Tr key={employee.id} onClick={() => navigate(`/employees/${employee.id}`)}>
                      <Td>
                        <PersonCell
                          name={`${employee.firstName} ${employee.lastName}`}
                          secondary={employee.designation}
                          src={employee.avatarUrl}
                        />
                      </Td>
                      <Td className="tabular hidden text-ink-secondary lg:table-cell">
                        {employee.employeeCode}
                      </Td>
                      <Td className="text-ink-secondary">{employee.department?.name ?? '—'}</Td>
                      <Td className="hidden xl:table-cell">
                        {employee.channelAssignments.length === 0 ? (
                          <span className="text-ink-muted">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {employee.channelAssignments.slice(0, 2).map((assignment) => (
                              <ChannelChip
                                key={assignment.channel}
                                channel={assignment.channel}
                                suffix={
                                  assignment.allocationPct < 100
                                    ? `${assignment.allocationPct}%`
                                    : undefined
                                }
                              />
                            ))}
                            {employee.channelAssignments.length > 2 && (
                              <span className="self-center text-xs text-ink-muted">
                                +{employee.channelAssignments.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </Td>
                      <Td className="tabular hidden text-ink-secondary md:table-cell">
                        {formatDate(employee.joiningDate)}
                      </Td>
                      <Td align="right" className="tabular hidden lg:table-cell">
                        {formatCompactCurrency(employee.ctcAnnual)}
                      </Td>
                      <Td>
                        <EmployeeStatusBadge status={employee.status} />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <Pagination
              meta={data.meta}
              itemLabel="employees"
              onPageChange={(page) => setFilters((previous) => ({ ...previous, page }))}
              onPageSizeChange={(pageSize) =>
                setFilters((previous) => ({ ...previous, pageSize, page: 1 }))
              }
            />
          </>
        )}
      </Card>

      <EmployeeFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        employee={editingId ? editing : undefined}
      />
    </>
  );
}
