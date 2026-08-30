import os
import random
import datetime
import configparser
import tkinter as tk
from tkinter import ttk, messagebox
from dataclasses import dataclass, field
from typing import List, Tuple, Optional, Dict

# ==========================================
# CONFIGURATION & DATA MODELS
# ==========================================

@dataclass
class WorksheetConfig:
    """Configuration for the worksheet generation."""
    rows: int = 10
    columns: int = 5
    num_pages: int = 1
    categories: List[str] = field(default_factory=lambda: ["basic"])
    basic_ratio: int = 50
    allow_duplicates: bool = False
    direction: str = "k2h"
    mixed_k2h_ratio: int = 50
    is_ordered: bool = False
    always_include: str = ""
    show_settings_footer: bool = True

@dataclass(frozen=True)
class KanaPair:
    katakana: str
    hiragana: str
    category: str

@dataclass
class WorksheetItem:
    """Represents a single box on the generated worksheet."""
    prompt: str
    answer: str
    prompt_type: str
    is_empty: bool = False

# ==========================================
# DATABASE
# ==========================================

class KanaDatabase:
    """Database of Japanese Kana mappings."""
    def __init__(self) -> None:
        self.basic_kana: List[Tuple[str, str]] = [
            ("ア", "あ"), ("イ", "い"), ("ウ", "う"), ("エ", "え"), ("オ", "お"),
            ("カ", "か"), ("キ", "き"), ("ク", "く"), ("ケ", "け"), ("コ", "こ"),
            ("サ", "さ"), ("シ", "し"), ("ス", "す"), ("セ", "せ"), ("ソ", "そ"),
            ("タ", "た"), ("チ", "ち"), ("ツ", "つ"), ("テ", "て"), ("ト", "と"),
            ("ナ", "な"), ("ニ", "に"), ("ヌ", "ぬ"), ("ネ", "ね"), ("ノ", "の"),
            ("ハ", "は"), ("ヒ", "ひ"), ("フ", "ふ"), ("ヘ", "へ"), ("ホ", "ほ"),
            ("マ", "ま"), ("ミ", "み"), ("ム", "む"), ("メ", "め"), ("モ", "も"),
            ("ヤ", "や"), ("ユ", "ゆ"), ("ヨ", "よ"),
            ("ラ", "ら"), ("リ", "り"), ("ル", "る"), ("レ", "れ"), ("ロ", "ろ"),
            ("ワ", "わ"), ("ヲ", "を"), ("ン", "ん")
        ]
        
        self.dakuten: List[Tuple[str, str]] = [
            ("ガ", "が"), ("ギ", "ぎ"), ("グ", "ぐ"), ("ゲ", "げ"), ("ゴ", "ご"),
            ("ザ", "ざ"), ("ジ", "じ"), ("ズ", "ず"), ("ゼ", "ぜ"), ("ゾ", "ぞ"),
            ("ダ", "だ"), ("ヂ", "ぢ"), ("ヅ", "づ"), ("デ", "で"), ("ド", "ど"),
            ("バ", "ば"), ("ビ", "び"), ("ブ", "ぶ"), ("ベ", "べ"), ("ボ", "ぼ")
        ]
        
        self.handakuten: List[Tuple[str, str]] = [
            ("パ", "ぱ"), ("ピ", "ぴ"), ("プ", "ぷ"), ("ペ", "ぺ"), ("ポ", "ぽ")
        ]
        
        self.youon: List[Tuple[str, str]] = [
            ("キャ", "きゃ"), ("キュ", "きゅ"), ("キョ", "きょ"),
            ("シャ", "しゃ"), ("シュ", "しゅ"), ("ショ", "しょ"),
            ("チャ", "ちゃ"), ("チュ", "ちゅ"), ("チョ", "ちょ"),
            ("ニャ", "にゃ"), ("ニュ", "にゅ"), ("ニョ", "にょ"),
            ("ヒャ", "ひゃ"), ("ヒュ", "ひゅ"), ("ヒョ", "ひょ"),
            ("ミャ", "みゃ"), ("ミュ", "みゅ"), ("ミョ", "みょ"),
            ("リャ", "りゃ"), ("リュ", "りゅ"), ("リョ", "りょ"),
            ("ギャ", "ぎゃ"), ("ギュ", "ぎゅ"), ("ギョ", "ぎょ"),
            ("ジャ", "じゃ"), ("ジュ", "じゅ"), ("ジョ", "じょ"),
            ("ビャ", "びゃ"), ("ビュ", "びゅ"), ("ビョ", "びょ"),
            ("ピャ", "ぴゃ"), ("ピュ", "ぴゅ"), ("ピョ", "ぴょ")
        ]
        
        self.small_kana: List[Tuple[str, str]] = [
            ("ッ", "っ"), ("ャ", "ゃ"), ("ュ", "ゅ"), ("ョ", "ょ")
        ]

        self.categories_map = {
            "basic": self.basic_kana,
            "dakuten": self.dakuten,
            "handakuten": self.handakuten,
            "youon": self.youon,
            "small": self.small_kana
        }

    def get_all_pairs(self) -> List[KanaPair]:
        pairs = []
        for cat, items in self.categories_map.items():
            for k, h in items:
                pairs.append(KanaPair(k, h, cat))
        return pairs

    def get_by_categories(self, categories: List[str]) -> List[KanaPair]:
        pairs: List[KanaPair] = []
        for cat in categories:
            if cat in self.categories_map:
                for katakana, hiragana in self.categories_map[cat]:
                    pairs.append(KanaPair(katakana, hiragana, cat))
        return pairs

    def find_pairs_with_direction(self, chars: List[str]) -> List[Tuple[KanaPair, str]]:
        found = []
        all_pairs = self.get_all_pairs()
        for c in chars:
            c = c.strip()
            if not c: continue
            for p in all_pairs:
                if p.hiragana == c:
                    if not any(x[0] == p for x in found):
                        found.append((p, "h2k"))
                    break
                elif p.katakana == c:
                    if not any(x[0] == p for x in found):
                        found.append((p, "k2h"))
                    break
        return found

# ==========================================
# RANDOMIZATION ENGINE
# ==========================================

class RandomizationEngine:
    def __init__(self, config: WorksheetConfig, database: KanaDatabase) -> None:
        self.config = config
        self.database = database

    def _anti_cluster_shuffle(self, items: list) -> list:
        if not items: return items
        random.shuffle(items)
        for i in range(1, len(items)):
            if items[i] is not None and items[i] == items[i-1]:
                for j in range(i+1, len(items)):
                    if items[j] != items[i] and (i+1 == len(items) or items[j] != items[i+1]):
                        items[i], items[j] = items[j], items[i]
                        break
        return items

    def _get_family_id(self, hiragana: str) -> str:
        if not hiragana: return "Other"
        h = hiragana[0]
        family_map = {
            "あいうえおぁぃぅぇぉ": "A",
            "かきくけこがぎぐげご": "K",
            "さしすせそざじずぜぞ": "S",
            "たちつてとだぢづでどっ": "T",
            "なにぬねの": "N",
            "はひふへほばびぶべぼぱぴぷぺぽ": "H",
            "まみむめも": "M",
            "やゆよゃゅょ": "Y",
            "らりるれろ": "R",
            "わをん": "W"
        }
        for chars, family in family_map.items():
            if h in chars: return family
        return "Other"

    def generate_pages_data(self) -> List[List[List[WorksheetItem]]]:
        mandatory_chars = [c.strip() for c in self.config.always_include.split(',') if c.strip()]
        mandatory_tuples = self.database.find_pairs_with_direction(mandatory_chars)
        mandatory_pairs = [t[0] for t in mandatory_tuples]
        forced_dirs = {t[0]: t[1] for t in mandatory_tuples}

        total_items_per_page = self.config.rows * self.config.columns
        pages_data = []
        all_pairs_ordered = self.database.get_all_pairs()

        has_basic = "basic" in self.config.categories
        other_cats = [c for c in self.config.categories if c != "basic"]
        has_other = len(other_cats) > 0
        
        pool_basic = self.database.get_by_categories(["basic"]) if has_basic else []
        pool_other = self.database.get_by_categories(other_cats) if has_other else []

        if not pool_basic and not pool_other and not mandatory_pairs:
            raise ValueError("No Kana available. Check your category and mandatory inputs.")

        for _ in range(self.config.num_pages):
            page_selected = mandatory_pairs[:total_items_per_page]
            needed = total_items_per_page - len(page_selected)
            
            m_basic_count = sum(1 for p in page_selected if p.category == "basic")
            
            if needed > 0:
                if has_basic and has_other:
                    target_basic = int(total_items_per_page * (self.config.basic_ratio / 100.0))
                    needed_basic = max(0, target_basic - m_basic_count)
                    needed_other = needed - needed_basic
                elif has_basic:
                    needed_basic = needed
                    needed_other = 0
                elif has_other:
                    needed_basic = 0
                    needed_other = needed
                else:
                    needed_basic = 0
                    needed_other = 0
                    
                p_basic = pool_basic[:]
                p_other = pool_other[:]
                
                if not self.config.allow_duplicates:
                    p_basic = [p for p in p_basic if p not in page_selected]
                    p_other = [p for p in p_other if p not in page_selected]
                    
                    if len(p_basic) < needed_basic:
                        deficit = needed_basic - len(p_basic)
                        needed_basic = len(p_basic)
                        if has_other: needed_other += deficit
                            
                    if len(p_other) < needed_other:
                        deficit = needed_other - len(p_other)
                        needed_other = len(p_other)
                        if has_basic: 
                            needed_basic += deficit
                            needed_basic = min(needed_basic, len(p_basic))
                            
                    page_selected.extend(random.sample(p_basic, needed_basic))
                    page_selected.extend(random.sample(p_other, needed_other))
                    
                    still_needed = total_items_per_page - len(page_selected)
                    if still_needed > 0:
                        page_selected.extend([None] * still_needed)
                else:
                    def sample_with_replacement(pool_source, count, fallback_pool):
                        res = []
                        for _ in range(count):
                            if pool_source: res.append(random.choice(pool_source))
                            elif fallback_pool: res.append(random.choice(fallback_pool))
                        return res
                        
                    page_selected.extend(sample_with_replacement(p_basic, needed_basic, p_other))
                    page_selected.extend(sample_with_replacement(p_other, needed_other, p_basic))
                    
                    still_needed = total_items_per_page - len(page_selected)
                    if still_needed > 0 and mandatory_pairs:
                        page_selected.extend([random.choice(mandatory_pairs) for _ in range(still_needed)])
                    elif still_needed > 0:
                        page_selected.extend([None] * still_needed)

            if self.config.is_ordered:
                real_pairs = [p for p in page_selected if p is not None]
                nones = [p for p in page_selected if p is None]
                real_pairs.sort(key=lambda x: all_pairs_ordered.index(x) if x in all_pairs_ordered else 999)
                page_selected = real_pairs + nones
            else:
                page_selected = self._anti_cluster_shuffle(page_selected)

            unique_pairs = list(set([p for p in page_selected if p is not None]))
            freq = {p: page_selected.count(p) for p in unique_pairs}
            
            dir_map = {}
            forced_family_dirs = {}
            
            for p in unique_pairs:
                if p in forced_dirs:
                    dir_map[p] = forced_dirs[p]
                    forced_family_dirs[self._get_family_id(p.hiragana)] = forced_dirs[p]

            target_k2h_count = int(total_items_per_page * (self.config.mixed_k2h_ratio / 100.0))
            current_k2h = sum(freq[p] for p in unique_pairs if p in forced_dirs and forced_dirs[p] == "k2h")
            
            unforced_pairs = [p for p in unique_pairs if p not in forced_dirs]
            unforced_pairs.sort(key=lambda p: freq[p], reverse=True)
            
            for p in unforced_pairs:
                fam = self._get_family_id(p.hiragana)
                
                if self.config.direction != "mixed":
                    if fam in forced_family_dirs:
                        dir_map[p] = forced_family_dirs[fam]
                    else:
                        dir_map[p] = self.config.direction
                else:
                    if fam in forced_family_dirs:
                        dir_map[p] = forced_family_dirs[fam]
                        if dir_map[p] == "k2h":
                            current_k2h += freq[p]
                    else:
                        if current_k2h < target_k2h_count and (target_k2h_count - current_k2h) >= (freq[p] * 0.4):
                            dir_map[p] = "k2h"
                            forced_family_dirs[fam] = "k2h"
                            current_k2h += freq[p]
                        else:
                            dir_map[p] = "h2k"
                            forced_family_dirs[fam] = "h2k"

            grid: List[List[WorksheetItem]] = []
            item_index = 0
            
            for _ in range(self.config.rows):
                row: List[WorksheetItem] = []
                for _ in range(self.config.columns):
                    pair = page_selected[item_index]
                    item_index += 1
                    
                    if pair is None:
                        row.append(WorksheetItem(prompt="", answer="", prompt_type="empty", is_empty=True))
                        continue
                    
                    item_dir = dir_map[pair]
                    
                    if item_dir == "k2h":
                        row.append(WorksheetItem(prompt=pair.katakana, answer=pair.hiragana, prompt_type="katakana"))
                    else:
                        row.append(WorksheetItem(prompt=pair.hiragana, answer=pair.katakana, prompt_type="hiragana"))
                
                grid.append(row)
                
            pages_data.append(grid)
            
        return pages_data

# ==========================================
# PURE PYTHON MULTI-PAGE PDF ENGINE
# ==========================================

class PurePythonPDFBuilder:
    def __init__(self):
        self.objects = []
        
    def _add_object(self, content: bytes) -> int:
        obj_id = len(self.objects) + 1
        obj_data = f"{obj_id} 0 obj\n".encode('ascii') + content + b"\nendobj\n"
        self.objects.append((obj_id, obj_data))
        return obj_id

    def build_pdf(self, stream_contents: List[str]) -> bytes:
        f1 = self._add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        
        fd = self._add_object(b"<< /Type /FontDescriptor /FontName /HeiseiMin-W3 /Flags 4 /FontBBox [-123 -257 1000 910] /MissingWidth 1000 /StemV 80 /CapHeight 700 /ItalicAngle 0 /Ascent 723 /Descent -240 >>")
        cid = self._add_object(f"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiMin-W3 /FontDescriptor {fd} 0 R /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> >>".encode('ascii'))
        f2 = self._add_object(f"<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiMin-W3-UniJIS-UTF16-H /Encoding /UniJIS-UTF16-H /DescendantFonts [{cid} 0 R] >>".encode('ascii'))
        
        page_obj_ids = []
        
        for stream_content in stream_contents:
            stream_bytes = stream_content.encode('ascii')
            stream_obj = self._add_object(f"<< /Length {len(stream_bytes)} >>\nstream\n".encode('ascii') + stream_bytes + b"\nendstream")
            
            resources = self._add_object(f"<< /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >>".encode('ascii'))
            page = self._add_object(f"<< /Type /Page /Parent __PARENT_PLACEHOLDER__ /MediaBox [0 0 595.28 841.89] /Contents {stream_obj} 0 R /Resources {resources} 0 R >>".encode('ascii'))
            page_obj_ids.append(page)
            
        kids_str = " ".join([f"{p} 0 R" for p in page_obj_ids])
        pages = self._add_object(f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_obj_ids)} >>".encode('ascii'))
        catalog = self._add_object(f"<< /Type /Catalog /Pages {pages} 0 R >>".encode('ascii'))
        
        for i, (oid, data) in enumerate(self.objects):
            if oid in page_obj_ids:
                self.objects[i] = (oid, data.replace(b"__PARENT_PLACEHOLDER__", f"{pages} 0 R".encode('ascii')))

        output = b"%PDF-1.4\n"
        offsets = {}
        for obj_id, obj_bytes in self.objects:
            offsets[obj_id] = len(output)
            output += obj_bytes
            
        xref_start = len(output)
        output += b"xref\n"
        output += f"0 {len(self.objects) + 1}\n".encode('ascii')
        output += b"0000000000 65535 f \n"
        for i in range(1, len(self.objects) + 1):
            output += f"{offsets[i]:010d} 00000 n \n".encode('ascii')
            
        output += b"trailer\n"
        output += f"<< /Size {len(self.objects) + 1} /Root {catalog} 0 R >>\n".encode('ascii')
        output += b"startxref\n"
        output += f"{xref_start}\n".encode('ascii')
        output += b"%%EOF\n"
        
        return output

class PDFWorksheetRenderer:
    WIDTH = 595.28
    HEIGHT = 841.89
    MARGIN = 40
    HEADER_HEIGHT = 100

    def __init__(self, config: WorksheetConfig, pages_data: List[List[List[WorksheetItem]]]) -> None:
        self.config = config
        self.pages_data = pages_data
        
        self.usable_width = self.WIDTH - (self.MARGIN * 2)
        self.usable_height = self.HEIGHT - self.MARGIN - self.HEADER_HEIGHT - 30
        
        self.cell_width = self.usable_width / self.config.columns
        self.cell_height = self.usable_height / self.config.rows

    def _encode_jp(self, text: str) -> str:
        return "<" + text.encode('utf-16be').hex().upper() + ">"

    def _get_center_offset_jp(self, text: str, font_size: float) -> float:
        return (len(text) * font_size * 0.95) / 2

    def render(self, is_answer_key: bool = False) -> bytes:
        streams = []
        
        if self.config.direction == "k2h":
            jp_title, en_title = "カタカナ → ひらがな 練習", "Write the Hiragana equivalent below."
        elif self.config.direction == "h2k":
            jp_title, en_title = "ひらがな → カタカナ 練習", "Write the Katakana equivalent below."
        else:
            jp_title, en_title = "ひらがな & カタカナ (Mixed)", "Write the opposite Kana equivalent below."

        total_pages = len(self.pages_data)

        # Build Settings String for footer
        cats_short = []
        if "basic" in self.config.categories: cats_short.append("Basic")
        if "dakuten" in self.config.categories: cats_short.append("Dak")
        if "handakuten" in self.config.categories: cats_short.append("Han")
        if "youon" in self.config.categories: cats_short.append("You")
        if "small" in self.config.categories: cats_short.append("Sml")
        cat_str = "+".join(cats_short) if cats_short else "None"
        
        dir_str = self.config.direction
        if dir_str == "mixed": dir_str += f"({self.config.mixed_k2h_ratio}%)"
        
        always_str = self.config.always_include if self.config.always_include else "None"
        
        en_settings = f"Layout: {self.config.rows}x{self.config.columns} | Dir: {dir_str} | Cats: {cat_str} | Basic: {self.config.basic_ratio}% | Ord: {self.config.is_ordered} | Dupes: {self.config.allow_duplicates} | Always: "
        
        # Escape parenthesis so PDF stream parsing doesn't break
        en_settings_safe = en_settings.replace('(', '\\(').replace(')', '\\)')

        for page_num, grid_data in enumerate(self.pages_data, start=1):
            stream = []
            
            stream.append(f"BT /F2 20 Tf {self.WIDTH/2 - self._get_center_offset_jp(jp_title, 20)} {self.HEIGHT - 50} Td {self._encode_jp(jp_title)} Tj ET")
            stream.append(f"BT /F2 12 Tf {self.WIDTH - self.MARGIN - 160} {self.HEIGHT - 80} Td {self._encode_jp('名前 (Name): _________________')} Tj ET")
            stream.append(f"BT /F1 12 Tf {self.MARGIN} {self.HEIGHT - 80} Td ({en_title.replace('(', '\\(').replace(')', '\\)')}) Tj ET")

            start_y = self.HEIGHT - self.HEADER_HEIGHT
            
            for r_idx, row in enumerate(grid_data):
                for c_idx, item in enumerate(row):
                    if item.is_empty:
                        continue
                    
                    x = self.MARGIN + (c_idx * self.cell_width)
                    y = start_y - (r_idx * self.cell_height)
                    center_x = x + (self.cell_width / 2)
                    
                    prompt_y = y - (self.cell_height * 0.25)
                    stream.append(f"BT /F2 20 Tf {center_x - self._get_center_offset_jp(item.prompt, 20)} {prompt_y} Td {self._encode_jp(item.prompt)} Tj ET")
                    
                    box_size = min(self.cell_width * 0.75, self.cell_height * 0.6)
                    box_x = center_x - (box_size / 2)
                    box_y = prompt_y - box_size - 8
                    
                    stream.append(f"q [] 0 d 0 0 0 RG 1.0 w {box_x} {box_y} {box_size} {box_size} re S Q")
                    
                    mid_x = box_x + (box_size / 2)
                    mid_y = box_y + (box_size / 2)
                    stream.append(f"q [2 2] 0 d 0.6 0.6 0.6 RG 0.5 w")
                    stream.append(f"{box_x} {mid_y} m {box_x + box_size} {mid_y} l S")
                    stream.append(f"{mid_x} {box_y} m {mid_x} {box_y + box_size} l S")
                    stream.append("Q")
                    
                    if is_answer_key:
                        ans_size = box_size * 0.7
                        ans_y = box_y + (box_size * 0.22)
                        stream.append(f"q 0.9 0.2 0.2 rg BT /F2 {ans_size:.1f} Tf {center_x - self._get_center_offset_jp(item.answer, ans_size)} {ans_y:.1f} Td {self._encode_jp(item.answer)} Tj ET Q")

            doc_type = "ANSWER KEY" if is_answer_key else "PRACTICE SHEET"
            page_info = f"Page {page_num} of {total_pages}"
            
            # Print Info at Y=28
            page_info_str = f"Japanese Worksheet Generator - {doc_type} - {page_info}".replace('(', '\\(').replace(')', '\\)')
            stream.append(f"BT /F1 10 Tf 0.5 0.5 0.5 rg {self.WIDTH/2 - 120} {28} Td ({page_info_str}) Tj ET")
            
            # Print Detailed Settings at Y=14 (Optional)
            if self.config.show_settings_footer:
                # Use Helvetica (F1) for English to keep it compact and prevent zenkaku spacing issues
                stream.append(f"BT /F1 6 Tf 0.5 0.5 0.5 rg {self.MARGIN} {14} Td ({en_settings_safe}) Tj ET")
                # Calculate approx offset for Japanese text (Helvetica size 6 is approx 3 units per char)
                offset = self.MARGIN + (len(en_settings) * 3.1)
                # Render Kana with HeiseiMin (F2)
                stream.append(f"BT /F2 6 Tf 0.5 0.5 0.5 rg {offset} {14} Td {self._encode_jp(always_str)} Tj ET")
            
            streams.append("\n".join(stream))

        builder = PurePythonPDFBuilder()
        return builder.build_pdf(streams)

# ==========================================
# ORCHESTRATOR
# ==========================================

class WorksheetOrchestrator:
    def __init__(self, config: WorksheetConfig, database: KanaDatabase) -> None:
        self.config = config
        self.database = database

    def generate(self, output_dir: str) -> Tuple[str, str]:
        randomizer = RandomizationEngine(self.config, self.database)
        pages_data = randomizer.generate_pages_data()
        
        renderer = PDFWorksheetRenderer(self.config, pages_data)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        
        worksheet_pdf = renderer.render(is_answer_key=False)
        worksheet_path = os.path.join(output_dir, f"worksheet_{timestamp}.pdf")
        with open(worksheet_path, "wb") as f:
            f.write(worksheet_pdf)
            
        answer_key_pdf = renderer.render(is_answer_key=True)
        answer_path = os.path.join(output_dir, f"answer_key_{timestamp}.pdf")
        with open(answer_path, "wb") as f:
            f.write(answer_key_pdf)
            
        return worksheet_path, answer_path

# ==========================================
# GRAPHICAL USER INTERFACE (GUI)
# ==========================================

class WorksheetApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Japanese Worksheet Generator (Native PDF)")
        self.geometry("520x790")
        self.resizable(False, False)
        
        self.columnconfigure(0, weight=1)
        
        self.config_dir = os.path.join(os.getcwd(), "settings")
        self.config_file = os.path.join(self.config_dir, "last_used.ini")
        
        self.rows_var = tk.IntVar(value=10)
        self.cols_var = tk.IntVar(value=5)
        self.pages_var = tk.IntVar(value=1)
        self.dup_var = tk.BooleanVar(value=False)
        self.dir_var = tk.StringVar(value="k2h")
        self.order_var = tk.BooleanVar(value=False)
        self.always_include_var = tk.StringVar(value="")
        self.basic_ratio_var = tk.IntVar(value=50)
        self.mixed_k2h_ratio_var = tk.IntVar(value=50)
        self.show_settings_var = tk.BooleanVar(value=True)
        
        self.cat_vars = {
            "basic": tk.BooleanVar(value=True),
            "dakuten": tk.BooleanVar(value=False),
            "handakuten": tk.BooleanVar(value=False),
            "youon": tk.BooleanVar(value=False),
            "small": tk.BooleanVar(value=False)
        }

        self.load_settings()
        self.setup_ui()

    def load_settings(self):
        if not os.path.exists(self.config_file):
            return
            
        config = configparser.ConfigParser()
        try:
            config.read(self.config_file, encoding='utf-8')
            
            self.rows_var.set(config.getint('LAYOUT', 'rows', fallback=10))
            self.cols_var.set(config.getint('LAYOUT', 'cols', fallback=5))
            self.pages_var.set(config.getint('LAYOUT', 'pages', fallback=1))
            
            self.cat_vars['basic'].set(config.getboolean('CATEGORIES', 'basic', fallback=True))
            self.cat_vars['dakuten'].set(config.getboolean('CATEGORIES', 'dakuten', fallback=False))
            self.cat_vars['handakuten'].set(config.getboolean('CATEGORIES', 'handakuten', fallback=False))
            self.cat_vars['youon'].set(config.getboolean('CATEGORIES', 'youon', fallback=False))
            self.cat_vars['small'].set(config.getboolean('CATEGORIES', 'small', fallback=False))
            self.basic_ratio_var.set(config.getint('CATEGORIES', 'basic_ratio', fallback=50))
            
            self.dir_var.set(config.get('OPTIONS', 'direction', fallback='k2h'))
            self.mixed_k2h_ratio_var.set(config.getint('OPTIONS', 'mixed_ratio', fallback=50))
            self.order_var.set(config.getboolean('OPTIONS', 'ordered', fallback=False))
            self.dup_var.set(config.getboolean('OPTIONS', 'duplicates', fallback=False))
            self.always_include_var.set(config.get('OPTIONS', 'always_include', fallback=''))
            self.show_settings_var.set(config.getboolean('OPTIONS', 'show_settings_footer', fallback=True))
            
        except Exception as e:
            print(f"Error loading configuration: {e}")

    def save_settings(self):
        config = configparser.ConfigParser()
        
        config['LAYOUT'] = {
            'rows': str(self.rows_var.get()),
            'cols': str(self.cols_var.get()),
            'pages': str(self.pages_var.get())
        }
        
        config['CATEGORIES'] = {
            'basic': str(self.cat_vars['basic'].get()),
            'dakuten': str(self.cat_vars['dakuten'].get()),
            'handakuten': str(self.cat_vars['handakuten'].get()),
            'youon': str(self.cat_vars['youon'].get()),
            'small': str(self.cat_vars['small'].get()),
            'basic_ratio': str(self.basic_ratio_var.get())
        }
        
        config['OPTIONS'] = {
            'direction': self.dir_var.get(),
            'mixed_ratio': str(self.mixed_k2h_ratio_var.get()),
            'ordered': str(self.order_var.get()),
            'duplicates': str(self.dup_var.get()),
            'always_include': self.always_include_var.get(),
            'show_settings_footer': str(self.show_settings_var.get())
        }
        
        os.makedirs(self.config_dir, exist_ok=True)
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                config.write(f)
        except Exception as e:
            print(f"Error saving configuration: {e}")

    def setup_ui(self):
        main_frame = ttk.Frame(self, padding="20")
        main_frame.grid(row=0, column=0, sticky="nsew")
        
        # --- Layout Frame ---
        layout_lf = ttk.LabelFrame(main_frame, text="Grid Layout & Pages", padding="10")
        layout_lf.pack(fill="x", pady=(0, 10))
        
        ttk.Label(layout_lf, text="Rows:").grid(row=0, column=0, sticky="w", padx=5, pady=5)
        ttk.Spinbox(layout_lf, from_=1, to=20, textvariable=self.rows_var, width=4).grid(row=0, column=1, sticky="w", padx=5)
        
        ttk.Label(layout_lf, text="Cols:").grid(row=0, column=2, sticky="w", padx=(10, 5), pady=5)
        ttk.Spinbox(layout_lf, from_=1, to=10, textvariable=self.cols_var, width=4).grid(row=0, column=3, sticky="w", padx=5)
        
        ttk.Label(layout_lf, text="Pages:").grid(row=0, column=4, sticky="w", padx=(10, 5), pady=5)
        ttk.Spinbox(layout_lf, from_=1, to=50, textvariable=self.pages_var, width=4).grid(row=0, column=5, sticky="w", padx=5)

        # --- Categories Frame ---
        cat_lf = ttk.LabelFrame(main_frame, text="Kana Categories", padding="10")
        cat_lf.pack(fill="x", pady=(0, 10))
        
        ttk.Checkbutton(cat_lf, text="Basic (ア, イ, ウ...)", variable=self.cat_vars["basic"]).grid(row=0, column=0, sticky="w", pady=2)
        ttk.Checkbutton(cat_lf, text="Dakuten (ガ, ギ, グ...)", variable=self.cat_vars["dakuten"]).grid(row=1, column=0, sticky="w", pady=2)
        ttk.Checkbutton(cat_lf, text="Handakuten (パ, ピ, プ...)", variable=self.cat_vars["handakuten"]).grid(row=2, column=0, sticky="w", pady=2)
        ttk.Checkbutton(cat_lf, text="Youon [Combos] (キャ, ギュ...)", variable=self.cat_vars["youon"]).grid(row=3, column=0, sticky="w", pady=2)
        ttk.Checkbutton(cat_lf, text="Small Modifiers (ッ, ャ, ョ...)", variable=self.cat_vars["small"]).grid(row=4, column=0, sticky="w", pady=2)

        ratio_frame = ttk.Frame(cat_lf)
        ratio_frame.grid(row=5, column=0, sticky="w", pady=(10,0))
        ttk.Label(ratio_frame, text="Basic Kana Ratio (%):").pack(side="left")
        ttk.Spinbox(ratio_frame, from_=0, to=100, textvariable=self.basic_ratio_var, width=5).pack(side="left", padx=10)

        # --- Settings Frame ---
        set_lf = ttk.LabelFrame(main_frame, text="Worksheet Options", padding="10")
        set_lf.pack(fill="x", pady=(0, 10))
        
        # Direction
        ttk.Label(set_lf, text="Direction:").grid(row=0, column=0, sticky="w", pady=(0,5))
        ttk.Radiobutton(set_lf, text="Katakana → Hiragana", variable=self.dir_var, value="k2h").grid(row=1, column=0, sticky="w", padx=10)
        ttk.Radiobutton(set_lf, text="Hiragana → Katakana", variable=self.dir_var, value="h2k").grid(row=2, column=0, sticky="w", padx=10)
        ttk.Radiobutton(set_lf, text="Mixed (Anti-Cheat Active)", variable=self.dir_var, value="mixed").grid(row=3, column=0, sticky="w", padx=10, pady=(0,5))
        
        mix_ratio_frame = ttk.Frame(set_lf)
        mix_ratio_frame.grid(row=4, column=0, sticky="w", padx=25, pady=(0,10))
        ttk.Label(mix_ratio_frame, text="Katakana→Hiragana Ratio (%):").pack(side="left")
        ttk.Spinbox(mix_ratio_frame, from_=0, to=100, textvariable=self.mixed_k2h_ratio_var, width=5).pack(side="left", padx=5)

        # Output Order
        ttk.Label(set_lf, text="Output Order:").grid(row=5, column=0, sticky="w", pady=(0,5))
        ttk.Radiobutton(set_lf, text="Randomized (Shuffled & Anti-Clustered)", variable=self.order_var, value=False).grid(row=6, column=0, sticky="w", padx=10)
        ttk.Radiobutton(set_lf, text="Sequential (a, i, u, e, o...)", variable=self.order_var, value=True).grid(row=7, column=0, sticky="w", padx=10, pady=(0,10))

        # Duplicates Checkbox
        ttk.Checkbutton(set_lf, text="Allow duplicates", variable=self.dup_var).grid(row=8, column=0, sticky="w")
        ttk.Label(set_lf, text="(If unchecked and grid > pool, extra spaces stay empty)", font=("TkDefaultFont", 8)).grid(row=9, column=0, sticky="w", padx=20)
        
        # Always Include
        ttk.Label(set_lf, text="Always Include (comma separated e.g. あ, ピ, ギャ):").grid(row=10, column=0, sticky="w", pady=(10,0))
        ttk.Entry(set_lf, textvariable=self.always_include_var, width=45).grid(row=11, column=0, sticky="w", padx=10, pady=(0, 5))

        # Footer toggle
        ttk.Checkbutton(set_lf, text="Print settings footer on PDF", variable=self.show_settings_var).grid(row=12, column=0, sticky="w", pady=(10,0))

        # --- Action Buttons ---
        btn_frame = ttk.Frame(main_frame)
        btn_frame.pack(fill="x", pady=(10, 0))
        
        generate_btn = ttk.Button(btn_frame, text="Generate PDF Worksheet", command=self.on_generate, width=30)
        generate_btn.pack(pady=10)

    def get_selected_categories(self) -> List[str]:
        return [cat for cat, var in self.cat_vars.items() if var.get()]

    def on_generate(self):
        categories = self.get_selected_categories()
        
        if not categories and not self.always_include_var.get().strip():
            messagebox.showwarning("Validation Error", "Please select a category or provide mandatory characters.")
            return
            
        try:
            self.save_settings()
            
            config = WorksheetConfig(
                rows=self.rows_var.get(),
                columns=self.cols_var.get(),
                num_pages=self.pages_var.get(),
                categories=categories,
                basic_ratio=self.basic_ratio_var.get(),
                allow_duplicates=self.dup_var.get(),
                direction=self.dir_var.get(),
                mixed_k2h_ratio=self.mixed_k2h_ratio_var.get(),
                is_ordered=self.order_var.get(),
                always_include=self.always_include_var.get(),
                show_settings_footer=self.show_settings_var.get()
            )
            
            output_dir = os.path.join(os.getcwd(), "output")
            os.makedirs(output_dir, exist_ok=True)
            
            db = KanaDatabase()
            orchestrator = WorksheetOrchestrator(config, db)
            
            w_path, a_path = orchestrator.generate(output_dir)
            
            w_name = os.path.basename(w_path)
            a_name = os.path.basename(a_path)
            
            messagebox.showinfo(
                "Success!", 
                f"Multi-Page PDFs generated successfully!\n\n"
                f"📂 Saved in: {output_dir}\n\n"
                f"📄 {w_name}\n"
                f"🔑 {a_name}\n\n"
                "You can now open these files and print them directly."
            )
            
        except Exception as e:
            messagebox.showerror("Unexpected Error", f"An error occurred:\n{str(e)}")

# ==========================================
# MAIN EXECUTION
# ==========================================

def main() -> None:
    app = WorksheetApp()
    app.mainloop()

if __name__ == "__main__":
    main()