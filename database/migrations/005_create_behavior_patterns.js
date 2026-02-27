exports.up = async function (knex) {
  await knex.schema.createTable('behavior_patterns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('customer_id').notNullable().references('id').inTable('customers');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations');
    table.string('pattern_type', 100).notNullable();
    table.decimal('confidence', 5, 4).notNullable();
    table.integer('frequency').notNullable();
    table.text('description');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('detected_at').notNullable();
    table.timestamp('valid_until');
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('customer_id');
    table.index('organization_id');
    table.index('pattern_type');
    table.index('detected_at', 'idx_patterns_detected', 'btree', { order: 'desc' });
  });

  // Add check constraints
  await knex.raw('ALTER TABLE behavior_patterns ADD CONSTRAINT check_confidence_range CHECK (confidence >= 0 AND confidence <= 1)');
  await knex.raw('ALTER TABLE behavior_patterns ADD CONSTRAINT check_frequency_positive CHECK (frequency > 0)');
};

exports.down = async function (knex) {
  await knex.raw('ALTER TABLE behavior_patterns DROP CONSTRAINT IF EXISTS check_confidence_range');
  await knex.raw('ALTER TABLE behavior_patterns DROP CONSTRAINT IF EXISTS check_frequency_positive');
  await knex.schema.dropTable('behavior_patterns');
};
