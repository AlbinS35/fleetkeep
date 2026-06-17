from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os

app = Flask(__name__)
CORS(app)

DB_FILE = "garage.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_column(cursor, table_name, column_name, column_definition):
    cursor.execute(f"PRAGMA table_info({table_name})")
    existing_columns = {row[1] for row in cursor.fetchall()}
    if column_name not in existing_columns:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")


def is_valid_iso_date(value):
    if not value:
        return True
    try:
        from datetime import datetime
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # 1. New Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )
    ''')
    # 2. Updated Vehicles Table linked to a specific user ID
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            reg_number TEXT NOT NULL,
            brand TEXT NOT NULL DEFAULT '',
            model_year INTEGER NOT NULL DEFAULT 0,
            fuel_type TEXT NOT NULL DEFAULT 'ICE',
            odometer INTEGER NOT NULL,
            next_service_odo INTEGER NOT NULL,
            rc_expiry TEXT NOT NULL DEFAULT '',
            tax_expiry TEXT NOT NULL DEFAULT '',
            insurance_expiry TEXT NOT NULL DEFAULT '',
            fitness_expiry TEXT NOT NULL DEFAULT '',
            pollution_expiry TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    ensure_column(cursor, 'vehicles', 'brand', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'model_year', 'INTEGER NOT NULL DEFAULT 0')
    ensure_column(cursor, 'vehicles', 'fuel_type', "TEXT NOT NULL DEFAULT 'ICE'")
    ensure_column(cursor, 'vehicles', 'rc_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'tax_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'insurance_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'fitness_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'pollution_expiry', 'TEXT')
    conn.commit()
    conn.close()

init_db()



# ================= AUTHENTICATION ROUTES =================

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if len(username) < 3 or len(password) < 6:
        return jsonify({"error": "Username must be ≥ 3 chars, Password ≥ 6 chars."}), 400

    hashed_password = generate_password_hash(password)
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hashed_password))
        conn.commit() # Explicitly save the record
        return jsonify({"message": "User registered successfully!"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken."}), 400
    except Exception as e:
        return jsonify({"error": f"Database failure: {str(e)}"}), 500
    finally:
        conn.close() # CRITICAL: This explicitly frees up the database lock!

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        
        if user and check_password_hash(user['password_hash'], password):
            return jsonify({
                "message": "Login successful!",
                "user": {"id": user['id'], "username": user['username']}
            }), 200
        return jsonify({"error": "Invalid username or password."}), 401
    finally:
        conn.close() # CRITICAL: Release lock after reading data

# ================= SECURE VEHICLE CRUD ROUTES =================

@app.route('/api/vehicles', methods=['GET'])
def get_vehicles():
    user_id = request.args.get('user_id') # Filter data by who is logged in!
    if not user_id:
        return jsonify({"error": "Unauthorized view access."}), 401

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vehicles WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
    return jsonify([dict(row) for row in rows])

@app.route('/api/vehicles', methods=['POST'])
def add_vehicle():
    data = request.json
    user_id = data.get('user_id')
    name = data.get('name', '').strip()
    reg_number = data.get('reg_number', '').strip().upper()
    brand = data.get('brand', '').strip()
    model_year = data.get('model_year')
    fuel_type = data.get('fuel_type', 'ICE').strip().upper()
    odometer = data.get('odometer')
    next_service_odo = data.get('next_service_odo')
    rc_expiry = data.get('rc_expiry', '').strip()
    tax_expiry = data.get('tax_expiry', '').strip()
    insurance_expiry = data.get('insurance_expiry', '').strip()
    fitness_expiry = data.get('fitness_expiry', '').strip()
    pollution_expiry = data.get('pollution_expiry', '').strip()

    # Data Type and Content Validation
    if not user_id or not name or not brand or not reg_number:
        return jsonify({"error": "Missing essential fields."}), 400
    if not model_year or int(model_year) < 1900:
        return jsonify({"error": "Model year must be a valid year."}), 400
    if int(odometer) < 0 or int(next_service_odo) <= int(odometer):
        return jsonify({"error": "Next service target must exceed current odometer reading."}), 400
    if fuel_type not in {"ICE", "EV"}:
        return jsonify({"error": "Fuel type must be ICE or EV."}), 400
    for expiry_value in [rc_expiry, tax_expiry, insurance_expiry, fitness_expiry]:
        if not is_valid_iso_date(expiry_value):
            return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400
    if fuel_type == 'ICE' and not pollution_expiry:
        return jsonify({"error": "Pollution certificate expiry is required for ICE vehicles."}), 400
    if fuel_type == 'EV':
        pollution_expiry = None
    elif not is_valid_iso_date(pollution_expiry):
        return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Check if this user already registered this specific plate sequence
        cursor.execute("SELECT id FROM vehicles WHERE user_id = ? AND reg_number = ?", (user_id, reg_number))
        if cursor.fetchone():
            return jsonify({"error": "This vehicle plate is already in your garage logs."}), 400

        cursor.execute(
            """
            INSERT INTO vehicles (
                user_id, name, reg_number, brand, model_year, fuel_type,
                odometer, next_service_odo, rc_expiry, tax_expiry,
                insurance_expiry, fitness_expiry, pollution_expiry
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, name, reg_number, brand, int(model_year), fuel_type,
                odometer, next_service_odo, rc_expiry, tax_expiry,
                insurance_expiry, fitness_expiry, pollution_expiry
            )
        )
    return jsonify({"message": "Vehicle logged successfully!"}), 201


@app.route('/api/vehicles/<int:id>', methods=['PUT'])
def update_vehicle(id):
    data = request.json
    user_id = data.get('user_id')
    name = data.get('name', '').strip()
    reg_number = data.get('reg_number', '').strip().upper()
    brand = data.get('brand', '').strip()
    model_year = data.get('model_year')
    fuel_type = data.get('fuel_type', 'ICE').strip().upper()
    odometer = data.get('odometer')
    next_service_odo = data.get('next_service_odo')
    rc_expiry = data.get('rc_expiry', '').strip()
    tax_expiry = data.get('tax_expiry', '').strip()
    insurance_expiry = data.get('insurance_expiry', '').strip()
    fitness_expiry = data.get('fitness_expiry', '').strip()
    pollution_expiry = data.get('pollution_expiry', '').strip()

    if not user_id or not name or not brand or not reg_number:
        return jsonify({"error": "Missing essential fields."}), 400
    if not model_year or int(model_year) < 1900:
        return jsonify({"error": "Model year must be a valid year."}), 400
    if int(odometer) < 0 or int(next_service_odo) <= int(odometer):
        return jsonify({"error": "Next service target must exceed current odometer reading."}), 400
    if fuel_type not in {"ICE", "EV"}:
        return jsonify({"error": "Fuel type must be ICE or EV."}), 400
    for expiry_value in [rc_expiry, tax_expiry, insurance_expiry, fitness_expiry]:
        if not is_valid_iso_date(expiry_value):
            return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400
    if fuel_type == 'ICE' and not pollution_expiry:
        return jsonify({"error": "Pollution certificate expiry is required for ICE vehicles."}), 400
    if fuel_type == 'EV':
        pollution_expiry = None
    elif not is_valid_iso_date(pollution_expiry):
        return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM vehicles WHERE id = ? AND user_id = ?", (id, user_id))
        if not cursor.fetchone():
            return jsonify({"error": "Vehicle not found."}), 404

        cursor.execute(
            """
            UPDATE vehicles
            SET name = ?, reg_number = ?, brand = ?, model_year = ?, fuel_type = ?,
                odometer = ?, next_service_odo = ?, rc_expiry = ?, tax_expiry = ?,
                insurance_expiry = ?, fitness_expiry = ?, pollution_expiry = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                name, reg_number, brand, int(model_year), fuel_type,
                odometer, next_service_odo, rc_expiry, tax_expiry,
                insurance_expiry, fitness_expiry, pollution_expiry, id, user_id
            )
        )

        cursor.execute("SELECT * FROM vehicles WHERE id = ? AND user_id = ?", (id, user_id))
        vehicle = cursor.fetchone()

    return jsonify({"message": "Vehicle updated successfully.", "vehicle": dict(vehicle)}), 200

@app.route('/api/vehicles/<int:id>', methods=['DELETE'])
def delete_vehicle(id):
    # Basic Security Check: Verify user owns the asset before deleting
    user_id = request.args.get('user_id')
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vehicles WHERE id = ? AND user_id = ?", (id, user_id))
    return jsonify({"message": "Record modified."})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)