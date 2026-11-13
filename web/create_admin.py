"""Create/update the explicit Super-Admin allowlist in deployment environment.
No account identity or bootstrap secret is embedded here. This command validates
that the administrator email is supplied out-of-band, then prints the required
configuration key for an operator to set in their secret manager.
"""

import argparse
import re


def main():
    parser = argparse.ArgumentParser(
        description="Validate first AeroMind administrator configuration"
    )
    parser.add_argument("--email", required=True, help="Email supplied by the deployment operator")
    args = parser.parse_args()
    email = args.email.strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        parser.error("Adresse email invalide")
    print(
        "Administrateur initial validé. Configurez AEROMIND_SUPERADMIN_EMAILS dans le gestionnaire de secrets Render; aucune identité n’a été créée ni préremplie."
    )


if __name__ == "__main__":
    main()
