import json
import sys
import pytest
from gltest import ContractTest


def clear_known_contracts():
    for name, module in list(sys.modules.items()):
        if "genlayer" in name and hasattr(module, "__known_contract__"):
            setattr(module, "__known_contract__", None)


@pytest.fixture
def ct():
    clear_known_contracts()
    ct = ContractTest()
    ct.deploy_contract("contracts/contract.py")
    return ct


def install_mocks(ct, verdict="SUBSTANTIALLY_SIMILAR", similarity=85, reason="Test reason"):
    ct.client.provider.make_request(
        method="sim_installMocks",
        params={
            "llm_mocks": {
                ".*": json.dumps({
                    "verdict": verdict,
                    "similarity_pct": similarity,
                    "reason": reason,
                })
            },
            "web_mocks": {
                ".*original.*": {"status": 200, "body": "Original artwork content here with unique expression and style"},
                ".*accused.*": {"status": 200, "body": "Accused artwork content that copies the original expression"},
                ".*": {"status": 200, "body": "Generic web content for testing"},
            },
        },
    )


def file_claim(ct, account, bond=2000):
    ct.contract.connect(account).file_claim(
        args=["https://example.com/original", "https://example.com/accused", "This work was copied"]
    ).transact(value=bond)


# ═══════════════════════════════════════════
#  FAST TESTS — no nondet / LLM calls
# ═══════════════════════════════════════════

class TestFileClaimFast:
    @pytest.mark.fast
    def test_file_claim_success(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        assert ct.contract.get_claim_count(args=[]).call() == "1"

    @pytest.mark.fast
    def test_file_claim_fields_stored(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/orig", "https://example.com/acc", "My statement"]
        ).transact(value=2000)
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["original_url"] == "https://example.com/orig"
        assert claim["accused_url"] == "https://example.com/acc"
        assert claim["claimant_statement"] == "My statement"
        assert claim["bond"] == "2000"
        assert claim["status"] == "OPEN"
        assert claim["verdict"] == ""

    @pytest.mark.fast
    def test_file_claim_low_bond(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).file_claim(
                args=["https://example.com/original", "https://example.com/accused", "Copied"]
            ).transact(value=100)

    @pytest.mark.fast
    def test_file_claim_empty_original_url(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).file_claim(
                args=["", "https://example.com/accused", "Statement"]
            ).transact(value=2000)

    @pytest.mark.fast
    def test_file_claim_empty_accused_url(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).file_claim(
                args=["https://example.com/original", "", "Statement"]
            ).transact(value=2000)

    @pytest.mark.fast
    def test_file_claim_empty_statement(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).file_claim(
                args=["https://example.com/original", "https://example.com/accused", ""]
            ).transact(value=2000)

    @pytest.mark.fast
    def test_multiple_claims_increment_count(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        file_claim(ct, creator)
        file_claim(ct, creator)
        assert ct.contract.get_claim_count(args=[]).call() == "3"

    @pytest.mark.fast
    def test_claim_not_found(self, ct):
        with pytest.raises(Exception):
            ct.contract.get_claim(args=["999"]).call()

    @pytest.mark.fast
    def test_initial_count_zero(self, ct):
        assert ct.contract.get_claim_count(args=[]).call() == "0"


class TestRespondFast:
    @pytest.mark.fast
    def test_respond_success(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        respondent = ct.create_account()
        ct.contract.connect(respondent).respond(
            args=["0", "I created my work independently"]
        ).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["status"] == "RESPONDED"
        assert claim["respondent_statement"] == "I created my work independently"

    @pytest.mark.fast
    def test_respond_not_found(self, ct):
        respondent = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(respondent).respond(
                args=["99", "Defense"]
            ).transact()

    @pytest.mark.fast
    def test_respond_empty_statement(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        respondent = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(respondent).respond(
                args=["0", ""]
            ).transact()

    @pytest.mark.fast
    def test_respond_already_adjudicated(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct)
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        respondent = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(respondent).respond(
                args=["0", "Too late"]
            ).transact()


# ═══════════════════════════════════════════
#  SLOW TESTS — involve nondet / LLM mocks
# ═══════════════════════════════════════════

class TestAdjudicateSlow:
    @pytest.mark.slow
    def test_adjudicate_substantially_similar(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct, verdict="SUBSTANTIALLY_SIMILAR", similarity=85)
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["status"] == "ADJUDICATED"
        assert claim["verdict"] == "SUBSTANTIALLY_SIMILAR"
        assert claim["similarity_pct"] == 85

    @pytest.mark.slow
    def test_adjudicate_independent(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct, verdict="INDEPENDENT", similarity=15, reason="Works are independent")
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["verdict"] == "INDEPENDENT"
        assert claim["similarity_pct"] == 15

    @pytest.mark.slow
    def test_adjudicate_fair_use(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct, verdict="FAIR_USE", similarity=60, reason="Transformative use")
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["verdict"] == "FAIR_USE"

    @pytest.mark.slow
    def test_adjudicate_insufficient_evidence(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct, verdict="INSUFFICIENT_EVIDENCE", similarity=0, reason="Cannot compare")
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["verdict"] == "INSUFFICIENT_EVIDENCE"
        assert claim["similarity_pct"] == 0

    @pytest.mark.slow
    def test_double_adjudicate_fails(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        install_mocks(ct)
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        with pytest.raises(Exception):
            ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()

    @pytest.mark.slow
    def test_adjudicate_not_found(self, ct):
        install_mocks(ct)
        adjudicator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(adjudicator).adjudicate(args=["99"]).transact()

    @pytest.mark.slow
    def test_adjudicate_with_response(self, ct):
        creator = ct.create_account()
        file_claim(ct, creator)
        respondent = ct.create_account()
        ct.contract.connect(respondent).respond(
            args=["0", "My work is original"]
        ).transact()
        install_mocks(ct, verdict="INDEPENDENT", similarity=10)
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["status"] == "ADJUDICATED"
        assert claim["verdict"] == "INDEPENDENT"


class TestLifecycleSlow:
    @pytest.mark.slow
    def test_full_lifecycle_similar(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/original", "https://example.com/accused", "Copied my essay"]
        ).transact(value=5000)
        respondent = ct.create_account()
        ct.contract.connect(respondent).respond(
            args=["0", "Independent creation"]
        ).transact()
        install_mocks(ct, verdict="SUBSTANTIALLY_SIMILAR", similarity=92, reason="Near-identical phrasing")
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
        claim = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert claim["status"] == "ADJUDICATED"
        assert claim["verdict"] == "SUBSTANTIALLY_SIMILAR"
        assert claim["similarity_pct"] == 92
        assert claim["bond"] == "5000"
        assert claim["respondent_statement"] == "Independent creation"
