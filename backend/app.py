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

# Normalize legacy 'ICE' fuel_type to 'PETROL' for backward compatibility
def normalize_fuel_type(fuel_type):
    if not fuel_type:
        return 'PETROL'
    ft = fuel_type.strip().upper()
    if ft == 'ICE':
        return 'PETROL'
    return ft

VALID_FUEL_TYPES = {"PETROL", "DIESEL", "EV"}
VALID_VEHICLE_TYPES = {"CAR", "MOTORBIKE", "SCOOTER", "TRUCK", "BUS", "RICKSHAW"}

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # 1. Users Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )
    ''')
    # 2. Vehicles Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            reg_number TEXT NOT NULL,
            brand TEXT NOT NULL DEFAULT '',
            model_year INTEGER NOT NULL DEFAULT 0,
            fuel_type TEXT NOT NULL DEFAULT 'PETROL',
            vehicle_type TEXT NOT NULL DEFAULT 'CAR',
            odometer INTEGER NOT NULL,
            next_service_odo INTEGER NOT NULL,
            service_method TEXT NOT NULL DEFAULT 'km',
            service_period_months INTEGER,
            last_service_date TEXT,
            rc_expiry TEXT NOT NULL DEFAULT '',
            tax_expiry TEXT NOT NULL DEFAULT '',
            insurance_expiry TEXT NOT NULL DEFAULT '',
            fitness_expiry TEXT NOT NULL DEFAULT '',
            pollution_expiry TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    # Ensure all columns exist (for existing databases)
    ensure_column(cursor, 'vehicles', 'brand', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'model_year', 'INTEGER NOT NULL DEFAULT 0')
    ensure_column(cursor, 'vehicles', 'fuel_type', "TEXT NOT NULL DEFAULT 'PETROL'")
    ensure_column(cursor, 'vehicles', 'vehicle_type', "TEXT NOT NULL DEFAULT 'CAR'")
    ensure_column(cursor, 'vehicles', 'rc_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'insurance_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'fitness_expiry', "TEXT NOT NULL DEFAULT ''")
    ensure_column(cursor, 'vehicles', 'pollution_expiry', 'TEXT')
    ensure_column(cursor, 'vehicles', 'service_method', "TEXT NOT NULL DEFAULT 'km'")
    ensure_column(cursor, 'vehicles', 'service_period_months', 'INTEGER')
    ensure_column(cursor, 'vehicles', 'last_service_date', 'TEXT')
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
        conn.commit()
        return jsonify({"message": "User registered successfully!"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken."}), 400
    except Exception as e:
        return jsonify({"error": f"Database failure: {str(e)}"}), 500
    finally:
        conn.close()

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
        conn.close()

# ================= USER PROFILE UPDATE =================

@app.route('/api/users/<int:id>', methods=['PUT'])
def update_user(id):
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '')

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM users WHERE id = ?", (id,))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "User not found."}), 404

        if username != user['username']:
            cursor.execute("SELECT id FROM users WHERE username = ? AND id != ?", (username, id))
            if cursor.fetchone():
                return jsonify({"error": "Username already taken."}), 400

        cursor.execute("UPDATE users SET username = ? WHERE id = ?", (username, id))

        if password:
            if len(password) < 6:
                return jsonify({"error": "Password must be at least 6 characters."}), 400
            hashed = generate_password_hash(password)
            cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, id))

        conn.commit()

        return jsonify({
            "message": "Profile updated successfully.",
            "user": {"id": id, "username": username}
        }), 200
    except Exception as e:
        return jsonify({"error": f"Update failed: {str(e)}"}), 500
    finally:
        conn.close()

# ================= SECURE VEHICLE CRUD ROUTES =================

@app.route('/api/vehicles', methods=['GET'])
def get_vehicles():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized view access."}), 401

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vehicles WHERE user_id = ?", (user_id,))
        rows = cursor.fetchall()
    
    result = []
    for row in rows:
        v = dict(row)
        # Normalize legacy ICE fuel type
        if v.get('fuel_type', '').upper() == 'ICE':
            v['fuel_type'] = 'PETROL'
        result.append(v)
    return jsonify(result)

@app.route('/api/vehicles', methods=['POST'])
def add_vehicle():
    data = request.json
    user_id = data.get('user_id')
    name = data.get('name', '').strip()
    reg_number = data.get('reg_number', '').strip().upper()
    brand = data.get('brand', '').strip()
    model_year = data.get('model_year')
    fuel_type = normalize_fuel_type(data.get('fuel_type', 'PETROL'))
    vehicle_type = data.get('vehicle_type', 'CAR').strip().upper()
    odometer = data.get('odometer')
    next_service_odo = data.get('next_service_odo')
    service_method = data.get('service_method', 'km').strip().lower()
    service_period_months = data.get('service_period_months')
    last_service_date = data.get('last_service_date', '').strip() or None
    rc_expiry = data.get('rc_expiry', '').strip()
    insurance_expiry = data.get('insurance_expiry', '').strip()
    fitness_expiry = data.get('fitness_expiry', '').strip()
    pollution_expiry = data.get('pollution_expiry', '').strip()

    if not user_id or not name or not brand or not reg_number:
        return jsonify({"error": "Missing essential fields."}), 400
    if not model_year or int(model_year) < 1900:
        return jsonify({"error": "Model year must be a valid year."}), 400
    if fuel_type not in VALID_FUEL_TYPES:
        return jsonify({"error": "Fuel type must be Petrol, Diesel, or EV."}), 400
    if vehicle_type not in VALID_VEHICLE_TYPES:
        return jsonify({"error": "Invalid vehicle type."}), 400

    # Service validation — always validate km fields; validate time fields only if both are provided
    if int(odometer) < 0 or int(next_service_odo) <= int(odometer):
        return jsonify({"error": "Next service target must exceed current odometer reading."}), 400
    if service_period_months or last_service_date:
        if not service_period_months or int(service_period_months) < 1:
            return jsonify({"error": "Service period months must be at least 1 when time-based tracking is enabled."}), 400
        if not last_service_date or not is_valid_iso_date(last_service_date):
            return jsonify({"error": "Last service date is required when time-based tracking is enabled."}), 400

    for expiry_value in [rc_expiry, insurance_expiry, fitness_expiry]:
        if not is_valid_iso_date(expiry_value):
            return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400
    if fuel_type in ('PETROL', 'DIESEL') and not pollution_expiry:
        return jsonify({"error": "Pollution certificate expiry is required for Petrol/Diesel vehicles."}), 400
    if fuel_type == 'EV':
        pollution_expiry = None
    elif not is_valid_iso_date(pollution_expiry):
        return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM vehicles WHERE user_id = ? AND reg_number = ?", (user_id, reg_number))
        if cursor.fetchone():
            return jsonify({"error": "This vehicle plate is already in your garage logs."}), 400

        cursor.execute(
            """
            INSERT INTO vehicles (
                user_id, name, reg_number, brand, model_year, fuel_type, vehicle_type,
                odometer, next_service_odo, service_method, service_period_months, last_service_date,
                rc_expiry, insurance_expiry, fitness_expiry, pollution_expiry
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id, name, reg_number, brand, int(model_year), fuel_type, vehicle_type,
                int(odometer) if odometer is not None else 0,
                int(next_service_odo) if next_service_odo is not None else 0,
                service_method,
                int(service_period_months) if service_period_months else None,
                last_service_date,
                rc_expiry, insurance_expiry, fitness_expiry, pollution_expiry
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
    fuel_type = normalize_fuel_type(data.get('fuel_type', 'PETROL'))
    vehicle_type = data.get('vehicle_type', 'CAR').strip().upper()
    odometer = data.get('odometer')
    next_service_odo = data.get('next_service_odo')
    service_method = data.get('service_method', 'km').strip().lower()
    service_period_months = data.get('service_period_months')
    last_service_date = data.get('last_service_date', '').strip() or None
    rc_expiry = data.get('rc_expiry', '').strip()
    insurance_expiry = data.get('insurance_expiry', '').strip()
    fitness_expiry = data.get('fitness_expiry', '').strip()
    pollution_expiry = data.get('pollution_expiry', '').strip()

    if not user_id or not name or not brand or not reg_number:
        return jsonify({"error": "Missing essential fields."}), 400
    if not model_year or int(model_year) < 1900:
        return jsonify({"error": "Model year must be a valid year."}), 400
    if fuel_type not in VALID_FUEL_TYPES:
        return jsonify({"error": "Fuel type must be Petrol, Diesel, or EV."}), 400
    if vehicle_type not in VALID_VEHICLE_TYPES:
        return jsonify({"error": "Invalid vehicle type."}), 400

    if service_method == 'km':
        if int(odometer) < 0 or int(next_service_odo) <= int(odometer):
            return jsonify({"error": "Next service target must exceed current odometer reading."}), 400
    else:
        if not service_period_months or int(service_period_months) < 1:
            return jsonify({"error": "Service period months must be at least 1."}), 400
        if not last_service_date or not is_valid_iso_date(last_service_date):
            return jsonify({"error": "Last service date is required for time-based service."}), 400

    for expiry_value in [rc_expiry, insurance_expiry, fitness_expiry]:
        if not is_valid_iso_date(expiry_value):
            return jsonify({"error": "Document expiry dates must use YYYY-MM-DD format."}), 400
    if fuel_type in ('PETROL', 'DIESEL') and not pollution_expiry:
        return jsonify({"error": "Pollution certificate expiry is required for Petrol/Diesel vehicles."}), 400
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
            SET name = ?, reg_number = ?, brand = ?, model_year = ?, fuel_type = ?, vehicle_type = ?,
                odometer = ?, next_service_odo = ?, service_method = ?, service_period_months = ?,
                last_service_date = ?, rc_expiry = ?, insurance_expiry = ?, fitness_expiry = ?, pollution_expiry = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                name, reg_number, brand, int(model_year), fuel_type, vehicle_type,
                int(odometer) if odometer is not None else 0,
                int(next_service_odo) if next_service_odo is not None else 0,
                service_method,
                int(service_period_months) if service_period_months else None,
                last_service_date,
                rc_expiry, insurance_expiry, fitness_expiry, pollution_expiry,
                id, user_id
            )
        )

        cursor.execute("SELECT * FROM vehicles WHERE id = ? AND user_id = ?", (id, user_id))
        vehicle = cursor.fetchone()
        v = dict(vehicle)
        if v.get('fuel_type', '').upper() == 'ICE':
            v['fuel_type'] = 'PETROL'

    return jsonify({"message": "Vehicle updated successfully.", "vehicle": v}), 200

@app.route('/api/vehicles/<int:id>', methods=['DELETE'])
def delete_vehicle(id):
    user_id = request.args.get('user_id')
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vehicles WHERE id = ? AND user_id = ?", (id, user_id))
    return jsonify({"message": "Record modified."})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)