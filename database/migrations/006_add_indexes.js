exports.up = async function (knex) {
  // Add GIN index for JSONB metadata fields
  await knex.raw(
    'CREATE INDEX idx_interactions_metadata_gin ON customer_interactions USING gin(metadata)'
  );

  // Add full-text search index on interaction content
  await knex.raw(
    "CREATE INDEX idx_interactions_content_fts ON customer_interactions USING gin(to_tsvector('english', content))"
  );

  // Add sentiment label index
  await knex.raw(
    "CREATE INDEX idx_interactions_sentiment ON customer_interactions((sentiment->>'label'))"
  );
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_interactions_metadata_gin');
  await knex.raw('DROP INDEX IF EXISTS idx_interactions_content_fts');
  await knex.raw('DROP INDEX IF EXISTS idx_interactions_sentiment');
};
