exports.up = function (knex) {
  return knex.schema.createTable('customers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations');
    table.string('external_id', 255).notNullable();
    table.string('email', 255);
    table.string('first_name', 100);
    table.string('last_name', 100);
    table.string('segment', 100);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('first_seen_at').notNullable();
    table.timestamp('last_seen_at').notNullable();
    table.integer('interaction_count').defaultTo(0);
    table.decimal('average_sentiment', 5, 4);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['organization_id', 'external_id']);
    table.index('organization_id');
    table.index(['organization_id', 'external_id']);
    table.index('email');
    table.index('segment');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('customers');
};
