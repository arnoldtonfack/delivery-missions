-- Connexion par e-mail plutôt que par nom d'utilisateur.
-- RENAME (et non DROP + ADD) : conserve les données et la contrainte d'unicité.
ALTER TABLE "User" RENAME COLUMN "login" TO "email";
ALTER INDEX "User_login_key" RENAME TO "User_email_key";
