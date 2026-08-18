// MOCK SUPABASE CLIENT pointing to our Local Node.js Server
const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class SupabaseQueryBuilder {
    constructor(table) {
        this.table = table;
        this.query = { table, filters: [] };
    }

    select(columns = '*') {
        if (!this.query.action) {
            this.query.action = 'select';
        }
        this.query.select = columns;
        return this;
    }

    insert(data) {
        this.query.action = 'insert';
        this.query.data = data;
        return this;
    }

    upsert(data) {
        this.query.action = 'upsert';
        this.query.data = data;
        return this;
    }

    update(data) {
        this.query.action = 'update';
        this.query.data = data;
        return this;
    }

    delete() {
        this.query.action = 'delete';
        return this;
    }

    eq(column, value) {
        this.query.filters.push({ type: 'eq', column, value });
        return this;
    }

    neq(column, value) {
        this.query.filters.push({ type: 'neq', column, value });
        return this;
    }

    match(obj) {
        this.query.filters.push({ type: 'match', value: obj });
        return this;
    }

    in(column, array) {
        this.query.filters.push({ type: 'in', column, value: array });
        return this;
    }

    not(column, op, value) {
        this.query.filters.push({ type: 'not', column, op, value });
        return this;
    }

    is(column, value) {
        this.query.filters.push({ type: 'is', column, value });
        return this;
    }

    order(column, options = { ascending: true }) {
        this.query.order = { column, ascending: options.ascending };
        return this;
    }

    limit(count) {
        this.query.limit = count;
        return this;
    }

    single() {
        this.query.single = true;
        return this;
    }

    maybeSingle() {
        this.query.single = true;
        this.query.maybeSingle = true;
        return this;
    }

    async execute() {

        try {
            const response = await fetch(`${SERVER_URL}/api/supabase`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.query)
            });
            const result = await response.json();
            return result; // { data, error, count }
        } catch (err) {
            console.error('Mock Supabase fetch error:', err);
            return { data: null, error: err };
        }
    }

    // Support standard promise chaining used in the codebase
    then(onFulfilled, onRejected) {
        return this.execute().then(onFulfilled, onRejected);
    }
}

class SupabaseClient {
    constructor() {
        this.auth = {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signInWithPassword: async () => ({ data: null, error: null }),
            signOut: async () => ({ error: null })
        };
        
        this.storage = {
            from: (bucket) => ({
                upload: async (path, file) => ({ data: { path }, error: null }),
                getPublicUrl: (path) => ({ data: { publicUrl: `${SERVER_URL}/storage/${bucket}/${path}` } })
            })
        };
    }

    from(table) {
        return new SupabaseQueryBuilder(table);
    }

    channel(name) {
        const mockChannel = {
            on: () => mockChannel,
            subscribe: () => mockChannel,
            unsubscribe: () => mockChannel
        };
        return mockChannel;
    }

    removeChannel() {
        // Mock method
    }
}

export const supabase = new SupabaseClient();
