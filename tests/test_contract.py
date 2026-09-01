import json
import sys
import pytest
from gltest import ContractTest


def clear_known_contracts():
    for name, module in list(sys.modules.items()):
        if "genlayer" in name and hasattr(module, "__known_contract__"):
            setattr(module, "__known_contract__", None)


@pytest.fixture
def test_setup():
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
                ".*": {"status": 200, "body": "Generic web content"},
            },
        },
    )


class TestFileClaim:
    def test_file_claim_success(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/original", "https://example.com/accused", "This work was copied"]
        ).transact(value=2000)

        result = ct.contract.get_claim_count(args=[]).call()
        assert result == "1"

    def test_file_claim_low_bond(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).file_claim(
                args=["https://example.com/original", "https://example.com/accused", "Copied"]
            ).transact(value=100)


class TestAdjudicate:
    def test_adjudicate_similar(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/original", "https://example.com/accused", "Plagiarized my work"]
        ).transact(value=2000)

        install_mocks(ct, verdict="SUBSTANTIALLY_SIMILAR", similarity=85)

        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()

        result = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert result["status"] == "ADJUDICATED"
        assert result["verdict"] == "SUBSTANTIALLY_SIMILAR"

    def test_adjudicate_independent(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/original", "https://example.com/accused", "Looks similar"]
        ).transact(value=2000)

        install_mocks(ct, verdict="INDEPENDENT", similarity=20, reason="Independent creation")

        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()

        result = json.loads(ct.contract.get_claim(args=["0"]).call())
        assert result["verdict"] == "INDEPENDENT"

    def test_double_adjudicate_fails(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).file_claim(
            args=["https://example.com/original", "https://example.com/accused", "Copied"]
        ).transact(value=2000)

        install_mocks(ct)
        adjudicator = ct.create_account()
        ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()

        with pytest.raises(Exception):
            ct.contract.connect(adjudicator).adjudicate(args=["0"]).transact()
