import os
import random
import datetime
import configparser
import subprocess
import platform
import tkinter as tk
from tkinter import ttk, messagebox
from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Optional, Any

# ==========================================
# CONFIGURATION & DATA MODELS
# ==========================================

@dataclass
class OpConfig:
    enabled: bool = True
    weight: int = 25
    digits_left: int = 2
    digits_right: int = 1
    max_number: int = 0
    is_vertical: bool = False
    allow_regrouping: bool = False
    pct_regrouping: int = 30
    allow_remainder: bool = False
    allow_negatives: bool = False
    decimal_places: int = 0
    allow_crypto: bool = False
    pct_crypto: int = 10
    num_terms: int = 2
    allow_zero: bool = False

@dataclass
class MathConfig:
    rows: int = 4
    columns: int = 2
    num_pages: int = 1
    randomize_order: bool = True
    combined_pdf: bool = True
    mode: str = "standard"
    ops: Dict[str, OpConfig] = field(default_factory=dict)
    mixed_config: Dict[str, Any] = field(default_factory=lambda: {
        'enabled_ops': {'+': True, '-': True, '×': True, '÷': True},
        'max_digits': 2,
        'num_operations': 2,
        'use_parentheses': True,
        'allow_negatives': False,
        'decimal_places': 0,
        'allow_zero': False
    })
    simultaneous_config: Dict[str, Any] = field(default_factory=lambda: {
        'type': 'standard',
        'allow_negatives': False,
        'max_coef': 5
    })

@dataclass
class MathProblem:
    expr_parts: List[Any]
    answer: Any
    is_vertical: bool
    is_cryptarithm: bool
    missing_index: int
    operator: str
    sim_lines: Optional[List[str]] = None
    sim_type: Optional[str] = None
    sim_ans_x: Optional[int] = None
    sim_ans_y: Optional[int] = None

# ==========================================
# MATH ENGINE
# ==========================================

class MathGenerator:
    def __init__(self, config: MathConfig):
        self.config = config

    def _format_val(self, val: float, decimals: int) -> Any:
        if decimals == 0:
            return int(round(val))
        return round(val, decimals)

    def _get_max_limit(self, op_cfg: OpConfig) -> int:
        dig_max = 10**op_cfg.digits_left - 1
        if op_cfg.max_number <= 0:
            return dig_max
        return min(dig_max, op_cfg.max_number)

    def _generate_single_term(self, op_cfg: OpConfig, allow_zero: bool, avoid_one: bool = False) -> float:
        ml = self._get_max_limit(op_cfg)
        min_val = 0 if allow_zero else 1
        
        attempts = 0
        while attempts < 50:
            attempts += 1
            raw = random.randint(min_val, ml)
            if avoid_one and raw == 1:
                continue
            break
            
        if op_cfg.decimal_places > 0:
            val = round(raw / (10 ** op_cfg.decimal_places), op_cfg.decimal_places)
        else:
            val = raw
        if op_cfg.allow_negatives and random.random() < 0.5:
            val = -val
        return val

    def _generate_standard_problem(self, operator: str, op_cfg: OpConfig) -> Tuple[List[Any], Any]:
        ml = self._get_max_limit(op_cfg)
        num_terms = op_cfg.num_terms
        
        attempts = 0
        while attempts < 100:
            attempts += 1
            terms = []
            for i in range(num_terms):
                avoid_1 = (operator in ['×', '÷'] and random.random() > 0.15)
                terms.append(self._generate_single_term(op_cfg, op_cfg.allow_zero, avoid_one=avoid_1))
                
            if operator == "+":
                ans = sum(terms)
                ans = self._format_val(ans, op_cfg.decimal_places)
                expr = []
                for i, t in enumerate(terms):
                    if i > 0: expr.append("+")
                    expr.append(t)
                return expr, ans
                
            elif operator == "-":
                if not op_cfg.allow_negatives:
                    terms.sort(reverse=True)
                ans = terms[0]
                for t in terms[1:]:
                    ans -= t
                ans = self._format_val(ans, op_cfg.decimal_places)
                expr = []
                for i, t in enumerate(terms):
                    if i > 0: expr.append("-")
                    expr.append(t)
                return expr, ans
                
            elif operator == "×":
                ans = terms[0]
                for t in terms[1:]:
                    ans *= t
                ans = self._format_val(ans, op_cfg.decimal_places * num_terms)
                expr = []
                for i, t in enumerate(terms):
                    if i > 0: expr.append("×")
                    expr.append(t)
                return expr, ans
                
            elif operator == "÷":
                op2 = terms[1]
                if op2 == 0: op2 = 2
                if op_cfg.allow_remainder and op_cfg.decimal_places == 0:
                    divisor = abs(int(op2))
                    if divisor <= 1: divisor = 2
                    quotient = random.randint(1, max(1, ml // divisor))
                    remainder = random.randint(1, divisor - 1) if divisor > 1 else 0
                    dividend = quotient * divisor + remainder
                    ans = f"{quotient} R {remainder}" if remainder > 0 else str(quotient)
                    return [dividend, "÷", divisor], ans
                else:
                    raw_ans = random.randint(1, ml)
                    raw_div = random.randint(2 if op_cfg.allow_zero else 1, min(ml, 12))
                    dividend = raw_ans * raw_div
                    op1 = round(dividend / (10 ** op_cfg.decimal_places), op_cfg.decimal_places) if op_cfg.decimal_places > 0 else dividend
                    op2 = round(raw_div / (10 ** op_cfg.decimal_places), op_cfg.decimal_places) if op_cfg.decimal_places > 0 else raw_div
                    ans = self._format_val(raw_ans, op_cfg.decimal_places)
                    return [op1, "÷", op2], ans
                    
        return [2, operator, 2], 1

    def _generate_clean_mixed_problem(self) -> Tuple[List[Any], Any]:
        mc = self.config.mixed_config
        active_ops = [op for op, active in mc['enabled_ops'].items() if active]
        if not active_ops:
            active_ops = ['+']
            
        num_ops = mc['num_operations']
        num_terms = num_ops + 1
        ml = 10**mc['max_digits'] - 1
        min_val = 0 if mc['allow_zero'] else 1
        
        attempts = 0
        while attempts < 400:
            attempts += 1
            terms = []
            for _ in range(num_terms):
                t_val = random.randint(max(min_val, 2), ml) if ml >= 2 else random.randint(min_val, ml)
                terms.append(t_val)
                
            ops = [random.choice(active_ops) for _ in range(num_ops)]
            
            for i, op in enumerate(ops):
                if op == '÷':
                    divisor = random.randint(2, min(9, abs(int(terms[i]))))
                    quotient = random.randint(2, 9)
                    terms[i] = quotient * divisor
                    terms[i+1] = divisor

            tokens = []
            for i, t in enumerate(terms):
                tokens.append(t)
                if i < len(ops):
                    tokens.append(ops[i])
                    
            use_paren = mc['use_parentheses'] and len(tokens) >= 5 and random.random() < 0.7
            if use_paren:
                if len(tokens) == 5:
                    if random.random() < 0.5:
                        tokens = ["("] + tokens[0:3] + [")"] + tokens[3:]
                    else:
                        tokens = tokens[0:2] + ["("] + tokens[2:] + [")"]
                elif len(tokens) == 7:
                    if random.random() < 0.5:
                        tokens = ["("] + tokens[0:3] + [")"] + tokens[3:]
                    else:
                        tokens = tokens[0:2] + ["("] + tokens[2:5] + [")"] + tokens[5:]

            try:
                if "(" in tokens:
                    p_start = tokens.index("(")
                    p_end = tokens.index(")")
                    sub_tokens = tokens[p_start+1:p_end]
                    sub_eval_str = "".join([str(t) if t not in ['+', '-', '×', '÷'] else ('*' if t == '×' else ('/' if t == '÷' else t)) for t in sub_tokens])
                    sub_val = eval(sub_eval_str)
                    if sub_val < 0:
                        continue
                
                eval_str = "".join([str(t) if t not in ['+', '-', '×', '÷', '(', ')'] else ('*' if t == '×' else ('/' if t == '÷' else t)) for t in tokens])
                ans = eval(eval_str)
                if not mc['allow_negatives'] and ans < 0:
                    continue
                if isinstance(ans, float) and (abs(ans) > 9999 or not ans.is_integer() and mc['decimal_places'] == 0):
                    continue
                
                ans = self._format_val(ans, mc['decimal_places'])
                if abs(ans) > (10**(mc['max_digits'] + 1) - 1):
                    continue
                    
                return tokens, ans
            except:
                continue
                
        return [2, '+', 3], 5

    def _generate_simultaneous_problem(self) -> Tuple[List[str], str, int, int, str]:
        sc = self.config.simultaneous_config
        max_c = sc['max_coef']
        allow_neg = sc['allow_negatives']
        stype = sc['type']
        
        attempts = 0
        while attempts < 300:
            attempts += 1
            x_val = random.randint(-5 if allow_neg else 1, 9)
            y_val = random.randint(-5 if allow_neg else 1, 9)
            if x_val == 0 and y_val == 0:
                x_val = 1
                
            a1 = random.randint(1, max_c)
            b1 = random.randint(-max_c if allow_neg else 1, max_c)
            if b1 == 0: b1 = 1
            c1 = a1 * x_val + b1 * y_val
            
            def format_eq(a, b, c):
                part_a = f"{a}x" if a != 1 else "x"
                if a == 0: part_a = ""
                
                if b > 0:
                    part_b = f"+ {b}y" if b != 1 else f"+ y"
                    part_b = f"{part_b}" if part_a else f"{b}y" if b != 1 else f"y"
                elif b < 0:
                    abs_b = abs(b)
                    part_b = f"- {abs_b}y" if abs_b != 1 else f"- y"
                else:
                    part_b = ""
                    
                lhs = f"{part_a} {part_b}".strip()
                lhs = lhs.replace("+ -", "- ")
                return f"{lhs} = {c}"

            if stype == 'substitution_simple':
                line1 = format_eq(a1, b1, c1)
                var_name = random.choice(['x', 'y'])
                val_target = x_val if var_name == 'x' else y_val
                line2 = f"{var_name} = {val_target}"
                ans_str = f"x = {x_val}, y = {y_val}"
                return [line1, line2], ans_str, x_val, y_val, 'substitution_simple'
            else:
                a2 = random.randint(1, max_c)
                b2 = random.randint(-max_c if allow_neg else 1, max_c)
                if b2 == 0: b2 = 1
                c2 = a2 * x_val + b2 * y_val
                
                det = a1 * b2 - a2 * b1
                if det == 0:
                    continue
                    
                l1 = format_eq(a1, b1, c1)
                l2 = format_eq(a2, b2, c2)
                ans_str = f"x = {x_val}, y = {y_val}"
                return [l1, l2], ans_str, x_val, y_val, 'standard'
                
        return ["2x + y = 5", "x - y = 1"], "x = 2, y = 1", 2, 1, 'standard'

    def generate_pages(self) -> List[List[MathProblem]]:
        total_items = self.config.rows * self.config.columns
        pages = []
        
        if self.config.mode == "simultaneous":
            for _ in range(self.config.num_pages):
                page_problems = []
                for _ in range(total_items):
                    lines, ans, x_v, y_v, stype = self._generate_simultaneous_problem()
                    page_problems.append(MathProblem(
                        expr_parts=[],
                        operator="simultaneous",
                        answer=ans,
                        is_vertical=False,
                        is_cryptarithm=False,
                        missing_index=-1,
                        sim_lines=lines,
                        sim_type=stype,
                        sim_ans_x=x_v,
                        sim_ans_y=y_v
                    ))
                pages.append(page_problems)
            return pages

        if self.config.mode == "mixed_ops":
            for _ in range(self.config.num_pages):
                page_problems = []
                for _ in range(total_items):
                    expr, ans = self._generate_clean_mixed_problem()
                    page_problems.append(MathProblem(
                        expr_parts=expr,
                        operator="mixed",
                        answer=ans,
                        is_vertical=False,
                        is_cryptarithm=False,
                        missing_index=-1
                    ))
                pages.append(page_problems)
            return pages

        active_ops = {op: cfg for op, cfg in self.config.ops.items() if cfg.enabled and cfg.weight > 0}
        if not active_ops:
            return []
            
        total_weight = sum(cfg.weight for cfg in active_ops.values())
        
        for _ in range(self.config.num_pages):
            page_problems = []
            pool = []
            
            for op, cfg in active_ops.items():
                count = int((cfg.weight / total_weight) * total_items)
                pool.extend([op] * count)
                
            while len(pool) < total_items:
                pool.append(list(active_ops.keys())[0])
            if len(pool) > total_items:
                pool = pool[:total_items]
                
            op_counts = {op: pool.count(op) for op in active_ops}
            
            op_crypto_flags = {}
            for op, count in op_counts.items():
                op_cfg = self.config.ops[op]
                if not op_cfg.allow_crypto or count == 0:
                    op_crypto_flags[op] = [False] * count
                else:
                    num_crypto = int(round(count * (op_cfg.pct_crypto / 100.0)))
                    flags = [True] * num_crypto + [False] * (count - num_crypto)
                    random.shuffle(flags)
                    op_crypto_flags[op] = flags

            op_crypto_pointers = {op: 0 for op in active_ops}
            
            if self.config.randomize_order:
                random.shuffle(pool)
                
            for operator in pool:
                op_cfg = self.config.ops[operator]
                
                is_crypto = False
                if op_cfg.allow_crypto and op_crypto_flags[operator]:
                    is_crypto = op_crypto_flags[operator][op_crypto_pointers[operator]]
                    op_crypto_pointers[operator] += 1

                expr, ans = self._generate_standard_problem(operator, op_cfg)
                
                missing_index = -1
                if is_crypto:
                    missing_index = random.randint(0, len(expr) - 1)
                
                page_problems.append(MathProblem(
                    expr_parts=expr,
                    operator=operator,
                    answer=ans,
                    is_vertical=op_cfg.is_vertical and operator != "÷" and len(expr) == 3,
                    is_cryptarithm=is_crypto,
                    missing_index=missing_index
                ))
            pages.append(page_problems)
            
        return pages

# ==========================================
# PURE PYTHON PDF BUILDER & RENDERER
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
        f3 = self._add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>")
        
        page_obj_ids = []
        for stream_content in stream_contents:
            stream_bytes = stream_content.encode('ascii')
            stream_obj = self._add_object(f"<< /Length {len(stream_bytes)} >>\nstream\n".encode('ascii') + stream_bytes + b"\nendstream")
            
            resources = self._add_object(f"<< /Font << /F1 {f1} 0 R /F2 {f2} 0 R /F3 {f3} 0 R >> >>".encode('ascii'))
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

class MathPDFRenderer:
    WIDTH = 595.28
    HEIGHT = 841.89
    MARGIN = 40
    HEADER_HEIGHT = 100

    def __init__(self, config: MathConfig, pages: List[List[MathProblem]]):
        self.config = config
        self.pages = pages
        self.cell_width = (self.WIDTH - (self.MARGIN * 2)) / config.columns
        self.cell_height = (self.HEIGHT - self.MARGIN - self.HEADER_HEIGHT - 30) / config.rows
        
        has_vertical = any(p.is_vertical for p in sum(pages, []))
        if config.mode == "simultaneous":
            self.font_size = min(24.0, max(8.0, self.cell_width / 11.5, self.cell_height / 5.0))
        elif not has_vertical and config.mode == "standard":
            # More conservative font scaling to prevent horizontal overflow/bleeding into adjacent columns
            self.font_size = min(17.0, max(8.0, self.cell_width / 10.5, self.cell_height / 3.0))
        else:
            self.font_size = min(26.0, max(10.0, self.cell_width / 15.5, self.cell_height / 4.8))

    def _encode_utf16(self, text: str) -> str:
        return "<" + text.encode('utf-16be').hex().upper() + ">"

    def _draw_text(self, stream: List[str], text: str, x: float, y: float, is_red: bool = False, font_override: Optional[float] = None, font_key: str = "F1"):
        color = "0.9 0.2 0.2 rg" if is_red else "0 0 0 rg"
        fs = font_override if font_override else self.font_size
        
        if font_key == "F2" or any(c in text for c in ["×", "÷"]):
            f_to_use = "F2" if any(c in text for c in ["×", "÷"]) else font_key
            encoded = self._encode_utf16(text)
            stream.append(f"q {color} BT /{f_to_use} {fs:.1f} Tf {x:.1f} {y:.1f} Td {encoded} Tj ET Q")
        else:
            safe_text = str(text).replace('(', '\\(').replace(')', '\\)')
            stream.append(f"q {color} BT /{font_key} {fs:.1f} Tf {x:.1f} {y:.1f} Td ({safe_text}) Tj ET Q")

    def _draw_box(self, stream: List[str], x: float, y: float, chars_wide: int = 2):
        box_width = self.font_size * (chars_wide * 0.5) + (self.font_size * 0.3)
        box_height = self.font_size * 1.15
        box_y = y - (self.font_size * 0.15)
        stream.append(f"q [] 0 d 0.5 w {x:.1f} {box_y:.1f} {box_width:.1f} {box_height:.1f} re S Q")
        return box_width

    def _draw_simultaneous(self, stream, prob, x, y, is_answer_key, prob_num):
        fs = self.font_size
        
        self._draw_text(stream, f"{prob_num}.", x + 5, y, font_override=fs, font_key="F3")
        
        eq_x = x + max(35, self.cell_width * 0.12)
        line_spacing = fs * 1.55
        
        self._draw_text(stream, prob.sim_lines[0], eq_x, y, font_override=fs)
        self._draw_text(stream, prob.sim_lines[1], eq_x, y - line_spacing, font_override=fs)
        
        y_ans1 = y - (line_spacing * 2.35)
        y_ans2 = y - (line_spacing * 3.45)
        
        if prob.sim_type == 'substitution_simple':
            target_var = "x" if "x =" in prob.sim_lines[1] or "x=" in prob.sim_lines[1] else "y"
            missing_var = "y" if target_var == "x" else "x"
            ans_val = prob.sim_ans_x if missing_var == "x" else prob.sim_ans_y
            
            self._draw_text(stream, f"{missing_var} =", eq_x, y_ans1, font_override=fs)
            box_w = fs * 3.0
            box_h = fs * 1.15
            box_x = eq_x + (fs * 2.2)
            box_y = y_ans1 - (fs * 0.15)
            
            stream.append(f"q [] 0 d 0.5 w {box_x:.1f} {box_y:.1f} {box_w:.1f} {box_h:.1f} re S Q")
            if is_answer_key:
                self._draw_text(stream, str(ans_val), box_x + 6, y_ans1, True, font_override=fs)
        else:
            self._draw_text(stream, "x =", eq_x, y_ans1, font_override=fs)
            box_w = fs * 3.0
            box_h = fs * 1.15
            box_x = eq_x + (fs * 2.0)
            box_y = y_ans1 - (fs * 0.15)
            stream.append(f"q [] 0 d 0.5 w {box_x:.1f} {box_y:.1f} {box_w:.1f} {box_h:.1f} re S Q")
            if is_answer_key:
                self._draw_text(stream, str(prob.sim_ans_x), box_x + 6, y_ans1, True, font_override=fs)
                
            self._draw_text(stream, "y =", eq_x, y_ans2, font_override=fs)
            box_y2 = y_ans2 - (fs * 0.15)
            stream.append(f"q [] 0 d 0.5 w {box_x:.1f} {box_y2:.1f} {box_w:.1f} {box_h:.1f} re S Q")
            if is_answer_key:
                self._draw_text(stream, str(prob.sim_ans_y), box_x + 6, y_ans2, True, font_override=fs)

    def _draw_horizontal(self, stream, prob, x, y, is_answer_key, prob_num=None):
        cx = x + 4 
        spacing = self.font_size * 0.25 
        char_w = self.font_size * 0.5

        if prob_num is not None:
            self._draw_text(stream, f"{prob_num}.", cx, y, font_override=self.font_size * 0.9, font_key="F3")
            cx += (len(str(prob_num)) + 1) * char_w * 0.9 + spacing

        def advance_box(val_str):
            bw = self._draw_box(stream, cx, y, max(len(val_str), 2))
            if is_answer_key:
                ans_width = len(val_str) * char_w
                self._draw_text(stream, val_str, cx + (bw/2) - (ans_width/2), y + (self.font_size*0.12), True)
            return bw + spacing

        def advance_text(val_str):
            self._draw_text(stream, val_str, cx, y)
            w = 0.7 if val_str in ["×", "÷"] else 0.5
            return (len(str(val_str)) * self.font_size * w) + spacing

        for idx, part in enumerate(prob.expr_parts):
            part_str = f"({part})" if isinstance(part, (int, float)) and part < 0 else str(part)
            
            is_missing = prob.is_cryptarithm and (idx == prob.missing_index)
            
            if is_missing:
                cx += advance_box(part_str)
            else:
                cx += advance_text(part_str)

        cx += advance_text("=")

        ans_str = str(prob.answer)
        if prob.is_cryptarithm:
            cx += advance_text(ans_str)
        else:
            cx += advance_box(ans_str)

    def _draw_vertical_standard(self, stream, prob, x, y, is_answer_key, prob_num=None):
        x_right = x + (self.cell_width * 0.65)
        line_spacing = self.font_size * 1.05
        char_w = self.font_size * 0.5
        
        op1, op, op2 = prob.expr_parts[0], prob.expr_parts[1], prob.expr_parts[2]
        y_op1 = y - line_spacing
        y_op2 = y - (line_spacing * 2)
        y_ans = y - (line_spacing * 3.2)
        y_line = y - (line_spacing * 2.1)

        if prob_num is not None:
            self._draw_text(stream, f"{prob_num}.", x + 5, y, font_override=self.font_size * 0.9, font_key="F3")

        def right_text(val_str, cy):
            self._draw_text(stream, val_str, x_right - (len(str(val_str)) * char_w), cy)
            
        def right_box(val_str, cy):
            bw = self.font_size * (max(len(val_str), 2) * 0.5) + (self.font_size * 0.3)
            self._draw_box(stream, x_right - bw, cy, max(len(val_str), 2))
            if is_answer_key:
                ans_w = len(val_str) * char_w
                self._draw_text(stream, val_str, x_right - bw + (bw/2) - (ans_w/2), cy + (self.font_size*0.12), True)

        right_text(f"({op1})" if isinstance(op1, (int,float)) and op1 < 0 else str(op1), y_op1)
        self._draw_text(stream, op, x_right - (self.font_size * 2.2), y_op2)
        right_text(f"({op2})" if isinstance(op2, (int,float)) and op2 < 0 else str(op2), y_op2)

        stream.append(f"q 1 w {x_right - (self.font_size * 2.5):.1f} {y_line:.1f} m {x_right + (self.font_size * 0.2):.1f} {y_line:.1f} l S Q")

        ans_str = str(prob.answer)
        right_box(ans_str, y_ans)

    def _draw_vertical_division(self, stream, prob, x, y, is_answer_key, prob_num=None):
        cx = x + (self.cell_width * 0.15)
        cy = y - (self.cell_height * 0.45)
        char_w = self.font_size * 0.5
        
        op1, op, op2 = prob.expr_parts[2], prob.expr_parts[1], prob.expr_parts[0]
        
        if prob_num is not None:
            self._draw_text(stream, f"{prob_num}.", x + 5, y, font_override=self.font_size * 0.9, font_key="F3")

        div_str = str(op2)
        self._draw_text(stream, div_str, cx, cy)
        cx_div_end = cx + (len(div_str) * char_w)
            
        paren_x = cx_div_end + (self.font_size * 0.05)
        self._draw_text(stream, ")", paren_x, cy)
        
        dividend_x = paren_x + (self.font_size * 0.55)
        div_str_val = str(op1)
        self._draw_text(stream, div_str_val, dividend_x, cy)
        dividend_end = dividend_x + (len(str(div_str_val)) * char_w)
            
        roof_y = cy + (self.font_size * 0.85)
        line_start = paren_x + (self.font_size * 0.15)
        line_end = dividend_end + (self.font_size * 0.2)
        stream.append(f"q 1 w {line_start:.1f} {roof_y:.1f} m {line_end:.1f} {roof_y:.1f} l S Q")
        
        ans_y = roof_y + (self.font_size * 0.2)
        ans_str = str(prob.answer)
        bw_ans = self._draw_box(stream, dividend_x, ans_y, max(len(ans_str), 2))
        if is_answer_key:
            self._draw_text(stream, ans_str, dividend_x + (bw_ans/2) - (len(ans_str)*char_w/2), ans_y + (self.font_size*0.12), True)

    def render_combined(self) -> bytes:
        streams = []
        for page_num, problems in enumerate(self.pages, 1):
            stream = []
            title = "Math Practice Sheet"
            stream.append(f"BT /F1 20 Tf {self.MARGIN} {self.HEIGHT - 50} Td ({title}) Tj ET")
            stream.append(f"BT /F1 12 Tf {self.WIDTH - self.MARGIN - 150} {self.HEIGHT - 50} Td (Name: _________________) Tj ET")
            start_y = self.HEIGHT - self.HEADER_HEIGHT
            for i, prob in enumerate(problems):
                row = i // self.config.columns
                col = i % self.config.columns
                x = self.MARGIN + (col * self.cell_width)
                y = start_y - (row * self.cell_height)
                
                if prob.operator == "simultaneous":
                    self._draw_simultaneous(stream, prob, x, y, False, i + 1)
                elif prob.is_vertical:
                    if prob.operator == "÷":
                        self._draw_vertical_division(stream, prob, x, y, False, i + 1)
                    else:
                        self._draw_vertical_standard(stream, prob, x, y, False, i + 1)
                else:
                    self._draw_horizontal(stream, prob, x, y, False, i + 1)
            streams.append("\n".join(stream))
            
        for page_num, problems in enumerate(self.pages, 1):
            stream = []
            title = "Math Answer Key"
            stream.append(f"BT /F1 20 Tf {self.MARGIN} {self.HEIGHT - 50} Td ({title}) Tj ET")
            stream.append(f"BT /F1 12 Tf {self.WIDTH - self.MARGIN - 150} {self.HEIGHT - 50} Td (Name: _________________) Tj ET")
            start_y = self.HEIGHT - self.HEADER_HEIGHT
            for i, prob in enumerate(problems):
                row = i // self.config.columns
                col = i % self.config.columns
                x = self.MARGIN + (col * self.cell_width)
                y = start_y - (row * self.cell_height)
                
                if prob.operator == "simultaneous":
                    self._draw_simultaneous(stream, prob, x, y, True, i + 1)
                elif prob.is_vertical:
                    if prob.operator == "÷":
                        self._draw_vertical_division(stream, prob, x, y, True, i + 1)
                    else:
                        self._draw_vertical_standard(stream, prob, x, y, True, i + 1)
                else:
                    self._draw_horizontal(stream, prob, x, y, True, i + 1)
            streams.append("\n".join(stream))

        builder = PurePythonPDFBuilder()
        return builder.build_pdf(streams)

# ==========================================
# GUI APPLICATION
# ==========================================

class MathApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Advanced Math Worksheet Generator")
        self.geometry("860x860")
        self.minsize(800, 750)
        
        self.config_dir = os.path.join(os.getcwd(), "settings")
        self.config_file = os.path.join(self.config_dir, "math_settings.ini")
        
        self.gen_vars = {
            'rows': tk.IntVar(value=4),
            'cols': tk.IntVar(value=2),
            'pages': tk.IntVar(value=1),
            'rand_order': tk.BooleanVar(value=True),
            'combined_pdf': tk.BooleanVar(value=True)
        }
        
        self.mixed_vars = {
            'add': tk.BooleanVar(value=True),
            'sub': tk.BooleanVar(value=True),
            'mul': tk.BooleanVar(value=True),
            'div': tk.BooleanVar(value=True),
            'max_digits': tk.IntVar(value=2),
            'num_operations': tk.IntVar(value=2),
            'parentheses': tk.BooleanVar(value=True),
            'negatives': tk.BooleanVar(value=False),
            'decimals': tk.IntVar(value=0),
            'allow_zero': tk.BooleanVar(value=False)
        }

        self.sim_vars = {
            'type': tk.StringVar(value='standard'),
            'negatives': tk.BooleanVar(value=False),
            'max_coef': tk.IntVar(value=5)
        }
        
        self.op_vars = {}
        self.ratio_combos = {}
        
        self.setup_ui()
        self.load_settings()

    def setup_ui(self):
        top_header_frame = ttk.Frame(self, padding="10")
        top_header_frame.pack(side="top", fill="x")

        title_label = ttk.Label(top_header_frame, text="Advanced Math Worksheet Generator", font=("Helvetica", 14, "bold"))
        title_label.pack(side="left", padx=5)

        generate_btn = ttk.Button(top_header_frame, text="Generate PDFs", command=self.generate, width=22)
        generate_btn.pack(side="right", padx=5)

        main_container = ttk.Frame(self)
        main_container.pack(side="top", fill="both", expand=True, padx=10, pady=(0, 10))
        
        self.notebook = ttk.Notebook(main_container)
        self.notebook.pack(fill="both", expand=True)
        
        self.tab_standard = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_standard, text="Standard Worksheets")
        self.setup_standard_tab(self.tab_standard)
        
        self.tab_mixed = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_mixed, text="Mixed Continuous Equations")
        self.setup_mixed_tab(self.tab_mixed)

        self.tab_sim = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_sim, text="Simultaneous Equations")
        self.setup_sim_tab(self.tab_sim)

    def setup_standard_tab(self, parent):
        canvas = tk.Canvas(parent, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas, padding="10")
        
        scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        top_lf = ttk.LabelFrame(scrollable_frame, text="Global Layout & Options", padding="10")
        top_lf.pack(fill="x", pady=(0, 10))
        
        ttk.Label(top_lf, text="Rows:").grid(row=0, column=0, sticky="w")
        ttk.Spinbox(top_lf, from_=1, to=25, textvariable=self.gen_vars['rows'], width=5).grid(row=0, column=1, padx=5, sticky="w")
        
        ttk.Label(top_lf, text="Cols:").grid(row=0, column=2, padx=(10,0), sticky="w")
        ttk.Spinbox(top_lf, from_=1, to=15, textvariable=self.gen_vars['cols'], width=5).grid(row=0, column=3, padx=5, sticky="w")
        
        ttk.Label(top_lf, text="Pages:").grid(row=0, column=4, padx=(10,0), sticky="w")
        ttk.Spinbox(top_lf, from_=1, to=50, textvariable=self.gen_vars['pages'], width=5).grid(row=0, column=5, padx=5, sticky="w")
        
        ttk.Checkbutton(top_lf, text="Randomize Order", variable=self.gen_vars['rand_order']).grid(row=0, column=6, padx=15, sticky="w")
        ttk.Checkbutton(top_lf, text="Combine Test & Answers in 1 File", variable=self.gen_vars['combined_pdf']).grid(row=1, column=0, columnspan=4, sticky="w", pady=(10,0))

        ops_grid_frame = ttk.Frame(scrollable_frame)
        ops_grid_frame.pack(fill="both", expand=True, pady=5)
        
        op_definitions = [
            ("Addition (+)", "+", {'weight': 50}),
            ("Subtraction (-)", "-", {'weight': 50}),
            ("Multiplication (×)", "×", {'weight': 0}),
            ("Division (÷)", "÷", {'weight': 0})
        ]
        
        r_idx = 0
        c_idx = 0
        for title, op_key, defaults in op_definitions:
            frame, v_dict = self.create_op_panel(ops_grid_frame, title, op_key, defaults)
            frame.grid(row=r_idx, column=c_idx, padx=5, pady=5, sticky="nsew")
            c_idx += 1
            if c_idx > 1:
                c_idx = 0
                r_idx += 1

    def create_op_panel(self, parent, title, op_key, defaults):
        lf = ttk.LabelFrame(parent, text=title, padding="10")
        
        vars_dict = {
            'enabled': tk.BooleanVar(value=defaults.get('enabled', True)),
            'weight': tk.StringVar(value=str(defaults.get('weight', 25))),
            'digits_l': tk.IntVar(value=defaults.get('digits_l', 2)),
            'digits_r': tk.IntVar(value=defaults.get('digits_r', 1)),
            'max_num': tk.StringVar(value=""),
            'is_vertical': tk.BooleanVar(value=False),
            'regroup': tk.BooleanVar(value=False),
            'remainder': tk.BooleanVar(value=False),
            'negatives': tk.BooleanVar(value=False),
            'decimals': tk.IntVar(value=0),
            'num_terms': tk.IntVar(value=2),
            'allow_zero': tk.BooleanVar(value=False),
            'crypto': tk.BooleanVar(value=False),
            'pct_crypto': tk.StringVar(value="10")
        }

        ttk.Checkbutton(lf, text="Include", variable=vars_dict['enabled']).grid(row=0, column=0, sticky="w", pady=2)
        
        ttk.Label(lf, text="Mix %:").grid(row=0, column=1, sticky="w", padx=(10,2))
        ratio_values = [str(i) for i in range(0, 101, 5)]
        ratio_combo = ttk.Combobox(lf, textvariable=vars_dict['weight'], values=ratio_values, width=5, state="readonly")
        ratio_combo.grid(row=0, column=2, sticky="w")
        self.ratio_combos[op_key] = ratio_combo

        ttk.Label(lf, text="Max Digits (L / R):").grid(row=1, column=0, sticky="w", pady=(5,2))
        digits_frame = ttk.Frame(lf)
        digits_frame.grid(row=1, column=1, columnspan=2, sticky="w", pady=2)
        ttk.Spinbox(digits_frame, from_=1, to=5, textvariable=vars_dict['digits_l'], width=3).pack(side="left")
        ttk.Label(digits_frame, text="/").pack(side="left", padx=2)
        ttk.Spinbox(digits_frame, from_=1, to=5, textvariable=vars_dict['digits_r'], width=3).pack(side="left")

        ttk.Label(lf, text="Max Limit (0=unlimited):").grid(row=2, column=0, sticky="w", pady=2)
        ttk.Entry(lf, textvariable=vars_dict['max_num'], width=6).grid(row=2, column=1, columnspan=2, sticky="w", pady=2)

        curr_row = 3
        if op_key in ["+", "-", "×"]:
            terms_frame = ttk.Frame(lf)
            terms_frame.grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
            ttk.Label(terms_frame, text="Terms Count:").pack(side="left")
            ttk.Spinbox(terms_frame, from_=2, to=4, textvariable=vars_dict['num_terms'], width=3).pack(side="left", padx=5)
            curr_row += 1

        ttk.Checkbutton(lf, text="Vertical Form", variable=vars_dict['is_vertical']).grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=(5,2))
        curr_row += 1

        if op_key in ["+", "-"]:
            ttk.Checkbutton(lf, text="Allow Regrouping", variable=vars_dict['regroup']).grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
            curr_row += 1
        elif op_key == "÷":
            ttk.Checkbutton(lf, text="Allow Remainder", variable=vars_dict['remainder']).grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
            curr_row += 1

        ttk.Checkbutton(lf, text="Allow Negative Values", variable=vars_dict['negatives']).grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
        curr_row += 1

        if op_key != "÷":
            ttk.Checkbutton(lf, text="Allow 0 Option", variable=vars_dict['allow_zero']).grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
            curr_row += 1

        dec_frame = ttk.Frame(lf)
        dec_frame.grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
        ttk.Label(dec_frame, text="Decimal Digits:").pack(side="left")
        ttk.Spinbox(dec_frame, from_=0, to=3, textvariable=vars_dict['decimals'], width=3).pack(side="left", padx=5)
        curr_row += 1

        crypto_frame = ttk.Frame(lf)
        crypto_frame.grid(row=curr_row, column=0, columnspan=3, sticky="w", pady=2)
        ttk.Checkbutton(crypto_frame, text="Cryptarithms", variable=vars_dict['crypto']).pack(side="left")
        ttk.Label(crypto_frame, text=" %:").pack(side="left", padx=(5,2))
        crypto_combo = ttk.Combobox(crypto_frame, textvariable=vars_dict['pct_crypto'], values=ratio_values, width=4, state="readonly")
        crypto_combo.pack(side="left")

        self.op_vars[op_key] = vars_dict
        return lf, vars_dict

    def setup_mixed_tab(self, parent):
        lf = ttk.LabelFrame(parent, text="Mixed Continuous Equations Configuration", padding="15")
        lf.pack(fill="both", expand=True, padx=20, pady=20)
        
        ttk.Label(lf, text="Select Included Operations:").grid(row=0, column=0, sticky="w", pady=5)
        ops_frame = ttk.Frame(lf)
        ops_frame.grid(row=1, column=0, sticky="w", pady=5)
        ttk.Checkbutton(ops_frame, text="Addition (+)", variable=self.mixed_vars['add']).pack(side="left", padx=10)
        ttk.Checkbutton(ops_frame, text="Subtraction (-)", variable=self.mixed_vars['sub']).pack(side="left", padx=10)
        ttk.Checkbutton(ops_frame, text="Multiplication (×)", variable=self.mixed_vars['mul']).pack(side="left", padx=10)
        ttk.Checkbutton(ops_frame, text="Division (÷)", variable=self.mixed_vars['div']).pack(side="left", padx=10)
        
        ttk.Label(lf, text="Max Digits per Number:").grid(row=2, column=0, sticky="w", pady=(15,5))
        ttk.Spinbox(lf, from_=1, to=4, textvariable=self.mixed_vars['max_digits'], width=5).grid(row=3, column=0, sticky="w", pady=5)
        
        ttk.Label(lf, text="Number of Operations (up to 3 continuous):").grid(row=4, column=0, sticky="w", pady=(15,5))
        ttk.Spinbox(lf, from_=1, to=3, textvariable=self.mixed_vars['num_operations'], width=5).grid(row=5, column=0, sticky="w", pady=5)
        
        ttk.Checkbutton(lf, text="Randomized Parentheses Order (e.g. 3 × (4 + 3))", variable=self.mixed_vars['parentheses']).grid(row=6, column=0, sticky="w", pady=15)
        ttk.Checkbutton(lf, text="Allow Negative Values", variable=self.mixed_vars['negatives']).grid(row=7, column=0, sticky="w", pady=5)
        ttk.Checkbutton(lf, text="Allow 0 Option", variable=self.mixed_vars['allow_zero']).grid(row=8, column=0, sticky="w", pady=5)
        
        dec_frame = ttk.Frame(lf)
        dec_frame.grid(row=9, column=0, sticky="w", pady=10)
        ttk.Label(dec_frame, text="Decimal Digits:").pack(side="left")
        ttk.Spinbox(dec_frame, from_=0, to=3, textvariable=self.mixed_vars['decimals'], width=5).pack(side="left", padx=10)

    def setup_sim_tab(self, parent):
        lf = ttk.LabelFrame(parent, text="Basic Simultaneous Equations Configuration", padding="15")
        lf.pack(fill="both", expand=True, padx=20, pady=20)
        
        ttk.Label(lf, text="Problem Type:").grid(row=0, column=0, sticky="w", pady=5)
        type_frame = ttk.Frame(lf)
        type_frame.grid(row=1, column=0, sticky="w", pady=5)
        ttk.Radiobutton(type_frame, text="Straight Simultaneous Equations (x and y spaces)", variable=self.sim_vars['type'], value='standard').pack(anchor="w", pady=2)
        ttk.Radiobutton(type_frame, text="Simple Substitution (Second equation like y = 6, single space)", variable=self.sim_vars['type'], value='substitution_simple').pack(anchor="w", pady=2)
        
        ttk.Label(lf, text="Max Coefficient Size:").grid(row=2, column=0, sticky="w", pady=(15,5))
        ttk.Spinbox(lf, from_=2, to=10, textvariable=self.sim_vars['max_coef'], width=5).grid(row=3, column=0, sticky="w", pady=5)
        
        ttk.Checkbutton(lf, text="Allow Negative Values / Solutions", variable=self.sim_vars['negatives']).grid(row=4, column=0, sticky="w", pady=15)
        ttk.Label(lf, text="Note: Uses only variables 'x' and 'y' exclusively.", font=("Helvetica", 9, "italic")).grid(row=5, column=0, sticky="w", pady=5)

    def load_settings(self):
        if not os.path.exists(self.config_file):
            return
            
        config = configparser.ConfigParser()
        try:
            config.read(self.config_file, encoding='utf-8')
            if 'GLOBAL' in config:
                for k, v in self.gen_vars.items():
                    if k in config['GLOBAL']:
                        if isinstance(v, tk.BooleanVar): v.set(config['GLOBAL'].getboolean(k))
                        else: v.set(config['GLOBAL'].getint(k))
                        
            for op_key, v_dict in self.op_vars.items():
                section = f'OP_{op_key}'
                if section in config:
                    for k, v in v_dict.items():
                        if k in config[section]:
                            if isinstance(v, tk.BooleanVar): v.set(config[section].getboolean(k))
                            elif k in ['weight', 'pct_crypto', 'max_num']: v.set(config[section].get(k))
                            elif isinstance(v, tk.IntVar): v.set(config[section].getint(k))
                            else: v.set(config[section].get(k))
        except Exception as e:
            print(f"Failed to load settings: {e}")

    def save_settings(self):
        os.makedirs(self.config_dir, exist_ok=True)
        config = configparser.ConfigParser()
        config['GLOBAL'] = {k: str(v.get()) for k, v in self.gen_vars.items()}
        for op_key, v_dict in self.op_vars.items():
            config[f'OP_{op_key}'] = {k: str(v.get()) for k, v in v_dict.items()}
            
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                config.write(f)
        except Exception as e:
            print(f"Failed to save settings: {e}")

    def open_pdf(self, path: str):
        try:
            if platform.system() == 'Windows':
                os.startfile(path)
            elif platform.system() == 'Darwin':
                subprocess.call(['open', path])
            else:
                subprocess.call(['xdg-open', path])
        except Exception as e:
            messagebox.showerror("Error", f"Could not open file automatically: {e}")

    def generate(self):
        current_tab = self.notebook.index(self.notebook.select())
        if current_tab == 1:
            mode = "mixed_ops"
        elif current_tab == 2:
            mode = "simultaneous"
        else:
            mode = "standard"
        
        ops_config = {}
        total_weight = 0
        
        if mode == "standard":
            for op, v in self.op_vars.items():
                weight_val = int(v['weight'].get()) if v['enabled'].get() else 0
                if v['enabled'].get():
                    total_weight += weight_val
                    
                max_num_val = 0
                try:
                    if v['max_num'].get().strip():
                        max_num_val = int(v['max_num'].get().strip())
                except:
                    max_num_val = 0
                    
                ops_config[op] = OpConfig(
                    enabled=v['enabled'].get(),
                    weight=weight_val,
                    digits_left=v['digits_l'].get(),
                    digits_right=v['digits_r'].get(),
                    max_number=max_num_val,
                    is_vertical=v['is_vertical'].get(),
                    allow_regrouping=v['regroup'].get(),
                    allow_remainder=v['remainder'].get(),
                    allow_negatives=v['negatives'].get(),
                    decimal_places=v['decimals'].get(),
                    num_terms=v['num_terms'].get(),
                    allow_zero=v['allow_zero'].get() if 'allow_zero' in v else False,
                    allow_crypto=v['crypto'].get(),
                    pct_crypto=int(v['pct_crypto'].get())
                )

            if total_weight != 100:
                messagebox.showerror("Validation Error", f"Total mix percentage for enabled operators must equal exactly 100%. Current total: {total_weight}%")
                return

        rows = self.gen_vars['rows'].get()
        cols = self.gen_vars['cols'].get()
        
        max_recommended_rows = 5 if mode == "simultaneous" else 10
        if rows > max_recommended_rows or (rows * cols) > 24:
            proceed = messagebox.askyesno(
                "Density Warning", 
                f"The selected row/column layout ({rows} rows × {cols} columns) exceeds recommended spacing limits for {mode.replace('_', ' ')} questions.\n\nQuestions may appear tightly packed or overlap. Do you want to continue anyway?",
                icon='warning'
            )
            if not proceed:
                return

        self.save_settings()

        mixed_cfg = {
            'enabled_ops': {'+': self.mixed_vars['add'].get(), '-': self.mixed_vars['sub'].get(), '×': self.mixed_vars['mul'].get(), '÷': self.mixed_vars['div'].get()},
            'max_digits': self.mixed_vars['max_digits'].get(),
            'num_operations': self.mixed_vars['num_operations'].get(),
            'use_parentheses': self.mixed_vars['parentheses'].get(),
            'allow_negatives': self.mixed_vars['negatives'].get(),
            'decimal_places': self.mixed_vars['decimals'].get(),
            'allow_zero': self.mixed_vars['allow_zero'].get()
        }

        sim_cfg = {
            'type': self.sim_vars['type'].get(),
            'allow_negatives': self.sim_vars['negatives'].get(),
            'max_coef': self.sim_vars['max_coef'].get()
        }

        cfg = MathConfig(
            rows=rows,
            columns=cols,
            num_pages=self.gen_vars['pages'].get(),
            randomize_order=self.gen_vars['rand_order'].get(),
            combined_pdf=self.gen_vars['combined_pdf'].get(),
            mode=mode,
            ops=ops_config,
            mixed_config=mixed_cfg,
            simultaneous_config=sim_cfg
        )
        
        try:
            os.makedirs("output", exist_ok=True)
            engine = MathGenerator(cfg)
            pages = engine.generate_pages()
            
            renderer = MathPDFRenderer(cfg, pages)
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            
            target_file_path = ""
            if cfg.combined_pdf:
                target_file_path = os.path.abspath(f"output/math_worksheet_and_answers_{ts}.pdf")
                combined_pdf_bytes = renderer.render_combined()
                with open(target_file_path, "wb") as f:
                    f.write(combined_pdf_bytes)
            else:
                target_file_path = os.path.abspath(f"output/math_{ts}.pdf")
                ans_file_path = os.path.abspath(f"output/math_ans_{ts}.pdf")
                with open(target_file_path, "wb") as f:
                    f.write(renderer.render(False))
                with open(ans_file_path, "wb") as f:
                    f.write(renderer.render(True))
                
            success_win = tk.Toplevel(self)
            success_win.title("Success")
            success_win.geometry("380x150")
            success_win.resizable(False, False)
            
            ttk.Label(success_win, text="Math worksheets successfully generated!", font=("Helvetica", 11, "bold")).pack(pady=15)
            
            btn_frame = ttk.Frame(success_win)
            btn_frame.pack(pady=10)
            
            ttk.Button(btn_frame, text="Open PDF", command=lambda: self.open_pdf(target_file_path)).pack(side="left", padx=5)
            ttk.Button(btn_frame, text="OK", command=success_win.destroy).pack(side="left", padx=5)
            
        except Exception as e:
            messagebox.showerror("Error", str(e))

if __name__ == "__main__":
    app = MathApp()
    app.mainloop()