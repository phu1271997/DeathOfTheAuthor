# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


def _addr_str(addr) -> str:
    try:
        return addr.as_hex
    except Exception:
        return str(addr)


class Contract(gl.Contract):
    claims: TreeMap[str, str]        # claim_id -> JSON-encoded claim
    claim_count: u256
    min_bond: u256

    def __init__(self):
        self.claim_count = u256(0)
        self.min_bond = u256(100)

    def _load(self, claim_id: str) -> dict:
        raw = self.claims.get(claim_id, "")
        if not raw:
            raise gl.vm.UserError("Claim not found")
        return json.loads(raw)

    def _save(self, claim_id: str, c: dict) -> None:
        self.claims[claim_id] = json.dumps(c)

    @gl.public.write.payable
    def file_claim(self, original_url: str, accused_url: str, statement: str) -> None:
        bond = int(gl.message.value)
        if bond < int(self.min_bond):
            raise gl.vm.UserError("Bond must be at least " + str(int(self.min_bond)))
        if not original_url.strip():
            raise gl.vm.UserError("Original URL required")
        if not accused_url.strip():
            raise gl.vm.UserError("Accused URL required")
        if not statement.strip():
            raise gl.vm.UserError("Statement required")

        claim_id = str(int(self.claim_count))
        self.claim_count = u256(int(self.claim_count) + 1)

        c = {
            "claimant": _addr_str(gl.message.sender),
            "original_url": original_url,
            "accused_url": accused_url,
            "claimant_statement": statement,
            "respondent": "",
            "respondent_statement": "",
            "bond": str(bond),
            "status": "OPEN",
            "verdict": "",
            "similarity_pct": 0,
            "reason": "",
        }
        self._save(claim_id, c)

    @gl.public.write
    def respond(self, claim_id: str, statement: str) -> None:
        c = self._load(claim_id)
        if c["status"] != "OPEN":
            raise gl.vm.UserError("Claim is not open for response")
        if not statement.strip():
            raise gl.vm.UserError("Response statement required")
        caller = _addr_str(gl.message.sender)
        if caller == c["claimant"]:
            raise gl.vm.UserError("Claimant cannot respond to own claim")

        c["respondent"] = caller
        c["respondent_statement"] = statement
        c["status"] = "RESPONDED"
        self._save(claim_id, c)

    @gl.public.write
    def adjudicate(self, claim_id: str) -> None:
        c = self._load(claim_id)
        if c["status"] not in ("OPEN", "RESPONDED"):
            raise gl.vm.UserError("Claim already adjudicated")

        original_url = c["original_url"]
        accused_url = c["accused_url"]
        claimant_statement = c["claimant_statement"]
        respondent_statement = c["respondent_statement"]

        def leader_fn():
            original_content = gl.nondet.web.render(original_url, mode="text")
            if not original_content or len(original_content.strip()) < 10:
                return json.dumps({
                    "verdict": "INSUFFICIENT_EVIDENCE",
                    "similarity_pct": 0,
                    "reason": "Could not fetch or read the original work"
                })

            accused_content = gl.nondet.web.render(accused_url, mode="text")
            if not accused_content or len(accused_content.strip()) < 10:
                return json.dumps({
                    "verdict": "INSUFFICIENT_EVIDENCE",
                    "similarity_pct": 0,
                    "reason": "Could not fetch or read the accused work"
                })

            prompt = f"""You are an impartial copyright adjudicator for an on-chain tribunal.
Compare the two works below for substantial similarity in EXPRESSION, not mere idea overlap.

=== ORIGINAL WORK (from {original_url}) ===
{original_content[:3000]}

=== ACCUSED WORK (from {accused_url}) ===
{accused_content[:3000]}

=== CLAIMANT STATEMENT ===
{claimant_statement}

=== RESPONDENT STATEMENT ===
{respondent_statement if respondent_statement else "(no response filed)"}

DECISION CRITERIA:
1. SUBSTANTIALLY_SIMILAR — the accused work copies protected expression beyond what coincidence or common source explains.
2. INDEPENDENT — the works share ideas but the expression is independently created.
3. FAIR_USE — the accused work transforms, comments on, or parodies the original (even if it borrows expression).
4. INSUFFICIENT_EVIDENCE — the content cannot be adequately compared from what is available.

Respond ONLY with valid JSON (no markdown, no code fences):
{{"verdict": "SUBSTANTIALLY_SIMILAR" | "INDEPENDENT" | "FAIR_USE" | "INSUFFICIENT_EVIDENCE", "similarity_pct": <integer 0-100>, "reason": "<one paragraph explanation>"}}"""

            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            try:
                leader_data = leader_res.calldata
                if isinstance(leader_data, str):
                    leader_data = json.loads(leader_data)
                my_result = leader_fn()
                if isinstance(my_result, str):
                    my_result = json.loads(my_result)
                if my_result["verdict"] != leader_data["verdict"]:
                    return False
                leader_sim = int(leader_data.get("similarity_pct", 0))
                my_sim = int(my_result.get("similarity_pct", 0))
                if abs(leader_sim - my_sim) > 20:
                    return False
                if not leader_data.get("reason", "").strip():
                    return False
                return True
            except Exception:
                return False

        result = gl.vm.run_nondet(leader_fn, validator_fn)
        if isinstance(result, str):
            result = json.loads(result)

        verdict = result.get("verdict", "INSUFFICIENT_EVIDENCE")
        sim_raw = int(result.get("similarity_pct", 0))
        sim_pct = max(0, min(100, sim_raw))
        reason = result.get("reason", "")

        c["verdict"] = verdict
        c["similarity_pct"] = sim_pct
        c["reason"] = reason
        c["status"] = "ADJUDICATED"
        self._save(claim_id, c)

        bond_u256 = u256(int(c["bond"]))
        if verdict == "SUBSTANTIALLY_SIMILAR":
            gl.get_contract_at(Address(c["claimant"])).emit_transfer(value=bond_u256)
        elif verdict == "INSUFFICIENT_EVIDENCE":
            gl.get_contract_at(Address(c["claimant"])).emit_transfer(value=bond_u256)
        elif c["respondent"]:
            gl.get_contract_at(Address(c["respondent"])).emit_transfer(value=bond_u256)

    @gl.public.view
    def get_claim(self, claim_id: str) -> str:
        c = self._load(claim_id)
        c["id"] = claim_id
        return json.dumps(c)

    @gl.public.view
    def get_claim_count(self) -> str:
        return str(int(self.claim_count))
