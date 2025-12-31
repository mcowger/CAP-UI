/**
 * API Client for CLIProxy Collector
 * Replaces Supabase with direct API calls to Bun server
 */

const API_BASE = '/api/data';

export const api = {
  /**
   * Fetch usage snapshots
   */
  async from(table: string) {
    return {
      select: (columns: string) => {
        const query = new ApiQueryBuilder(table, columns);
        return query;
      }
    };
  }
};

class ApiQueryBuilder {
  private table: string;
  private columns: string;
  private filters: string[] = [];
  private ordering: string | null = null;
  private limitValue: number | null = null;

  constructor(table: string, columns: string) {
    this.table = table;
    this.columns = columns;
  }

  order(column: string, options?: { ascending: boolean }) {
    const direction = options?.ascending ? 'asc' : 'desc';
    this.ordering = `${column}:${direction}`;
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push(`${column}:gte:${value}`);
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push(`${column}:lt:${value}`);
    return this;
  }

  async execute() {
    const params = new URLSearchParams({
      table: this.table,
      select: this.columns
    });

    if (this.ordering) params.append('order', this.ordering);
    if (this.limitValue) params.append('limit', this.limitValue.toString());
    if (this.filters.length > 0) {
      this.filters.forEach(f => params.append('filter', f));
    }

    try {
      const response = await fetch(`${API_BASE}?${params.toString()}`);
      if (!response.ok) {
        return { data: null, error: new Error(`HTTP ${response.status}`) };
      }
      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Make the builder awaitable
  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
  }
}
