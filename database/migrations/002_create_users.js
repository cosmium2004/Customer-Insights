exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('role', 50).notNullable();
    table.jsonb('permissions').defaultTo('[]');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('last_login_at');

    table.index('email');
    table.index('organization_id');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
