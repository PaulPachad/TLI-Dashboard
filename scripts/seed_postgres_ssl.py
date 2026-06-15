import pg8000
import urllib.parse
import sys
import ssl

# Connection string
conn_str = "postgresql://neondb_owner:npg_CYGv30ktBIbf@ep-purple-cell-adq2ksq2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"

print("Parsing connection string...")
# Parse connection string
result = urllib.parse.urlparse(conn_str)
username = result.username
password = result.password
database = result.path[1:] # remove leading slash
hostname = result.hostname
port = result.port or 5432

print(f"Connecting to Postgres at {hostname}:{port}...")
try:
    # Create a permissive SSL context
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    # Connect
    conn = pg8000.connect(
        user=username,
        password=password,
        host=hostname,
        port=port,
        database=database,
        ssl_context=ssl_context
    )
    cursor = conn.cursor()
    print("Connection established!")

    email = "support@authoritymag.co"
    password_hash = "$2b$12$3NZqrBt2i1YAdiyWWV.2dupigQio9TjmdMbS94.64uKbNhbaKAbn." # hash for "Thought@Leader"
    admin_id = "cmqafp9pq0000g2wcrxgqnx9d"

    # Check if user already exists
    cursor.execute('SELECT id, email FROM "User" WHERE email = %s;', (email,))
    row = cursor.fetchone()

    if row:
        print(f"Admin user {email} already exists (ID: {row[0]}). Updating password hash and role...")
        cursor.execute(
            'UPDATE "User" SET "passwordHash" = %s, role = %s, name = %s, "updatedAt" = NOW() WHERE id = %s;',
            (password_hash, "ADMIN", "Admin", row[0])
        )
    else:
        print(f"Admin user {email} does not exist. Inserting new admin account...")
        cursor.execute(
            'INSERT INTO "User" (id, email, "passwordHash", name, role, "createdAt", "updatedAt") VALUES (%s, %s, %s, %s, %s, NOW(), NOW());',
            (admin_id, email, password_hash, "Admin", "ADMIN")
        )

    conn.commit()
    print("Seed committed successfully!")

    # Verify
    cursor.execute('SELECT id, email, role, name FROM "User" WHERE role = %s;', ("ADMIN",))
    print("Admin users in PostgreSQL database:")
    for r in cursor.fetchall():
        print(r)

    cursor.close()
    conn.close()
    print("Connection closed.")

except Exception as e:
    print(f"Error seeding database: {e}", file=sys.stderr)
    sys.exit(1)
