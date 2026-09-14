"""
Rebuild interview_series.json from the Complete Topic Database CSV.
"""

import csv
import json
import os


try:
    import win32com.client
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

def get_csv_path():
    """Resolve the path to the CSV file, handling shortcuts if needed."""
    base_name = "Complete Topic Data Base - Sheet1"
    csv_file = f"{base_name}.csv"
    lnk_file = f"{base_name}.lnk"
    
    # 1. Check for local CSV (highest priority if it's a real file)
    if os.path.exists(csv_file):
        return os.path.abspath(csv_file)
        
    # 2. Check for shortcut
    if os.path.exists(lnk_file):
        # Try pure python resolution first (avoids needing pywin32 module)
        try:
            import re
            with open(lnk_file, 'rb') as f:
                data = f.read()
            paths = re.findall(b'[a-zA-Z]:\\\\[^\\x00\\t\\n\\r]+', data)
            for p in paths:
                decoded = p.decode('utf-8', errors='ignore').strip()
                if decoded.lower().endswith('.csv') and os.path.exists(decoded):
                    return decoded
        except Exception as e:
            print(f"Pure python shortcut resolution failed: {e}")

        # Fallback to win32com if available
        if HAS_WIN32:
            try:
                shell = win32com.client.Dispatch("WScript.Shell")
                shortcut = shell.CreateShortcut(os.path.abspath(lnk_file))
                target_path = shortcut.TargetPath
                if os.path.exists(target_path):
                    return target_path
            except Exception as e:
                print(f"Error resolving shortcut via win32com: {e}")
            
    # 3. Fallback
    return os.path.abspath(csv_file)

def heal_mojibake(text: str) -> str:
    """Heal common mojibake characters in topic name."""
    if not text:
        return text
    
    # 1. Recover strings that were read as latin-1/cp1252 but were actually UTF-8 bytes
    try:
        decoded = text.encode('latin-1').decode('utf-8')
        if decoded != text:
            return decoded
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    try:
        decoded = text.encode('cp1252').decode('utf-8')
        if decoded != text:
            return decoded
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    # 2. Normalize smart/curly punctuation and corrupted chars
    text = text.replace('\u2019', "'").replace('\u2018', "'")
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    text = text.replace('\u2013', '-').replace('\u2014', '-')
    import re
    text = re.sub(r'([a-zA-Z])\ufffd([a-zA-Z])', r"\1'\2", text)
    text = text.replace('\ufffd', '')

    # 3. Hardcoded fallback replacement for stubborn cases
    replacements = {
        'â\x80\x99': "'",
        'â€™': "'",
        'â\x80\x9c': '"',
        'â€œ': '"',
        'â\x80\x9d': '"',
        'â€\x9d': '"',
        'â\x80\x93': '-',
        'â€“': '-',
        'â\x80\x94': '-',
        'â€”': '-',
        'â\x80\xa6': '...',
        'â€¦': '...',
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
        
    return text.strip()


def read_csv_robust(csv_path: str) -> list:
    """
    Read CSV file robustly: try UTF-8 first (handling BOM),
    fall back to CP1252 with error replacement if it fails.
    """
    try:
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            return list(csv.reader(f))
    except UnicodeDecodeError:
        print(f"UTF-8 decode failed for {csv_path}, falling back to cp1252...")
        try:
            with open(csv_path, 'r', encoding='cp1252', errors='replace') as f:
                return list(csv.reader(f))
        except Exception as e:
            print(f"cp1252 decode failed: {e}, falling back to latin-1...")
            with open(csv_path, 'r', encoding='latin-1') as f:
                return list(csv.reader(f))


def build_from_csv():
    """Build the interview series database from the CSV file."""
    
    csv_path = get_csv_path()
    output_path = "data/interview_series.json"
    
    print(f"Reading topics from: {csv_path}")
    
    if not os.path.exists(csv_path):
        print(f"ERROR: CSV file not found: {csv_path}")
        return

    
    series = []
    current_category = "Uncategorized"
    
    rows = read_csv_robust(csv_path)
    
    for row_num, row in enumerate(rows, 1):
        if not row or len(row) < 1:
            continue
        
        topic_name = heal_mojibake(row[0].strip())
        title_formula = heal_mojibake(row[2].strip()) if len(row) > 2 else ""
        
        # Check ALL columns for a Google Docs link (some rows have link in col C)
        link = ""
        for col in row[1:]:
            if col and 'docs.google.com' in col:
                link = col.strip()
                break
        
        # If no doc link found, check if column B is a link at all
        if not link and len(row) > 1:
            link = row[1].strip()
        
        # Skip empty rows
        if not topic_name:
            continue
        
        # A formula identifies a topic even while its interview link is pending.
        # Do not discard these rows or make their title the next topic's category.
        awaiting_link = not link and bool(title_formula)
        if (not link and not awaiting_link) or 'medium.com/authority-magazine' in link:
            current_category = topic_name
            print(f"Category: {current_category}")
            continue
        
        # Only include if it has a Google Docs link
        if not awaiting_link and 'docs.google.com' not in link:
            print(f"  Skipping non-doc link: {topic_name}")
            continue
        
        # Generate keywords from the name
        keywords = []
        for word in topic_name.lower().split():
            if len(word) > 3 and word not in ['this', 'that', 'with', 'from', 'have', 'your', 'what', 'when', 'where', 'which']:
                keywords.append(word)
        
        entry = {
            "id": row_num,
            "name": topic_name,
            "display_name": topic_name,
            "title_formula": title_formula,
            "category": current_category,
            "link": link,
            "keywords": keywords[:5]  # Top 5 keywords
        }
        if awaiting_link:
            entry['status'] = 'awaiting_interview_link'
        series.append(entry)
    
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    
    # Write JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(series, f, indent=2, ensure_ascii=False)
    
    print(f"\nBuilt database with {len(series)} interview series")
    print(f"Awaiting interview links: {sum(not s['link'] for s in series)}")
    print(f"Saved to: {output_path}")
    
    return series

if __name__ == "__main__":
    build_from_csv()
