exports.up = function (knex) {
  return knex.schema.createTable('customer_interactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable().references('id').inTable('customers');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations');
    table.timestamp('timestamp').notNullable();
    table.string('channel', 50).notNullable();
    table.string('event_type', 100).notNullable();
    table.text('content');
    table.jsonb('sentiment');
    table.decimal('sentiment_confidence', 5, 4);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('processed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('organization_id');
    table.index('timestamp', 'idx_interactions_timestamp', 'btree', { order: 'desc' });
    table.index('channel');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('customer_interactions');
};
