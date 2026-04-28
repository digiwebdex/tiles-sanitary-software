import type { Knex } from 'knex';

/**
 * Dealer admin role safety.
 *
 * Ensures the canonical helper exists on VPS installations and repairs any
 * dealer-linked account that currently has no role. It deliberately does NOT
 * upgrade users who already have a role (for example salesman), so there is no
 * privilege escalation for invited staff accounts.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION assign_dealer_admin_role(_user_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      IF _user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = _user_id
          AND p.dealer_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'User is not linked to a dealer';
      END IF;

      INSERT INTO user_roles (user_id, role)
      VALUES (_user_id, 'dealer_admin'::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END;
    $$;
  `);

  await knex.raw(`
    REVOKE ALL ON FUNCTION assign_dealer_admin_role(uuid) FROM PUBLIC;
  `);

  await knex.raw(`
    INSERT INTO user_roles (user_id, role)
    SELECT p.id, 'dealer_admin'::app_role
    FROM profiles p
    WHERE p.dealer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = p.id
      )
    ON CONFLICT (user_id, role) DO NOTHING;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS assign_dealer_admin_role(uuid);`);
}
