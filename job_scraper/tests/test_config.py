"""Tests for the config-driven daily_scrape.py. Plain stdlib unittest, no pytest.

Run from the repo root:
    py -m unittest discover job_scraper/tests
"""
import sys
import tempfile
import unittest
from pathlib import Path

# job_scraper/ is not a package (no __init__.py), so add it to sys.path directly
# rather than relying on unittest discover to do it for us.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import daily_scrape  # noqa: E402

REPO = Path(__file__).resolve().parent.parent.parent


class LoadConfigTests(unittest.TestCase):
    def test_example_config_loads_and_parses(self):
        config = daily_scrape.load_config(REPO / "config.example.toml")
        self.assertIn("settings", config)
        self.assertIn("filters", config)
        self.assertIn("sources", config)
        self.assertIn("queries", config)
        self.assertGreater(len(config["queries"]), 0)
        self.assertIn("reed", config["sources"])
        self.assertEqual(config["filters"]["excluded_title_words"], [])

    def test_all_public_example_configs_are_valid(self):
        for path in sorted((REPO / "examples").glob("*.toml")):
            with self.subTest(path=path.name):
                config = daily_scrape.load_config(path)
                daily_scrape.validate_queries(config["queries"], config["sources"])
                self.assertGreater(len(config["queries"]), 0)

    def test_missing_config_file_raises_clear_error(self):
        missing = REPO / "job_scraper" / "tests" / "does-not-exist.toml"
        with self.assertRaises(daily_scrape.ConfigError) as ctx:
            daily_scrape.load_config(missing)
        self.assertIn("config.example.toml", str(ctx.exception))

    def test_malformed_toml_raises_config_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "config.toml"
            bad.write_text("this is not [ valid toml", encoding="utf-8")
            with self.assertRaises(daily_scrape.ConfigError):
                daily_scrape.load_config(bad)


class ValidateQueriesTests(unittest.TestCase):
    def setUp(self):
        self.sources = {"linkedin": ".agents/skills/linkedin-search/cli/src/cli.ts"}

    def test_known_source_passes(self):
        queries = [{"label": "ok query", "source": "linkedin", "args": []}]
        daily_scrape.validate_queries(queries, self.sources)  # should not raise

    def test_unknown_source_raises_clear_error_naming_label(self):
        queries = [{"label": "Bogus portal query", "source": "nope", "args": []}]
        with self.assertRaises(daily_scrape.ConfigError) as ctx:
            daily_scrape.validate_queries(queries, self.sources)
        self.assertIn("Bogus portal query", str(ctx.exception))
        self.assertIn("nope", str(ctx.exception))


class BuildPlanTests(unittest.TestCase):
    def test_missing_cli_file_is_marked_not_existing_not_fatal(self):
        sources = {"ghost": ".agents/skills/does-not-exist-search/cli/src/cli.ts"}
        queries = [{"label": "Ghost query", "source": "ghost", "args": ["search"]}]
        plan = daily_scrape.build_plan(queries, sources, REPO)
        self.assertEqual(len(plan), 1)
        self.assertFalse(plan[0]["exists"])

    def test_existing_cli_file_is_marked_existing(self):
        # reed-search ships in this repo; linkedin-search/freehire-search come from
        # the upstream ai-job-search clone this kit is unzipped on top of, so they
        # are legitimately absent here — that's the case build_plan/exists exists for.
        sources = {"reed": ".agents/skills/reed-search/cli/src/cli.ts"}
        queries = [{"label": "Real query", "source": "reed", "args": ["search"]}]
        plan = daily_scrape.build_plan(queries, sources, REPO)
        self.assertTrue(plan[0]["exists"])


class ExcludedTitleFilterTests(unittest.TestCase):
    def test_drops_only_words_the_user_configured(self):
        excluded_words = ["director", "chief"]
        for title in ["Finance Director", "Chief Operating Officer"]:
            self.assertTrue(
                daily_scrape.is_excluded_title(title, excluded_words),
                msg=f"expected {title!r} to be dropped",
            )

    def test_does_not_assume_a_sector_or_seniority(self):
        excluded_words = ["director", "chief"]
        for title in [
            "Staff Nurse",
            "Store Manager",
            "Senior Social Worker",
            "Project Coordinator",
        ]:
            self.assertFalse(
                daily_scrape.is_excluded_title(title, excluded_words),
                msg=f"expected {title!r} to pass through",
            )

    def test_reads_legacy_senior_words_for_existing_private_configs(self):
        self.assertEqual(
            daily_scrape.get_excluded_title_words({"senior_words": ["director"]}),
            ["director"],
        )

    def test_blank_exclusion_does_not_hide_every_job(self):
        self.assertFalse(daily_scrape.is_excluded_title("Staff Nurse", [""]))


class BlockedCompanyFilterTests(unittest.TestCase):
    def setUp(self):
        self.blocked = ["Example Aggregator", "Sample Recruiter"]

    def test_drops_blocked_companies_case_insensitively(self):
        for company in ["Example Aggregator", "example aggregator ltd", "SAMPLE RECRUITER"]:
            self.assertTrue(daily_scrape.is_blocked_company(company, self.blocked),
                             msg=f"expected {company!r} to be dropped")

    def test_keeps_unblocked_companies(self):
        for company in ["Reed", "JLR", "Rolls-Royce", ""]:
            self.assertFalse(daily_scrape.is_blocked_company(company, self.blocked),
                              msg=f"expected {company!r} to pass through")


class TrackerTests(unittest.TestCase):
    def test_unset_tracker_returns_none_and_no_crash(self):
        path = daily_scrape.get_tracker_path({}, env={})
        self.assertIsNone(path)
        keys = daily_scrape.tracker_keys(path)
        self.assertEqual(keys, set())

    def test_empty_string_tracker_setting_returns_none(self):
        path = daily_scrape.get_tracker_path({"tracker": ""}, env={})
        self.assertIsNone(path)

    def test_env_var_overrides_config_setting(self):
        path = daily_scrape.get_tracker_path(
            {"tracker": "config-tracker.xlsx"},
            env={"JOBSEARCH_TRACKER": "env-tracker.xlsx"},
        )
        self.assertEqual(path, Path("env-tracker.xlsx"))

    def test_missing_tracker_file_returns_empty_keys_without_crash(self):
        path = Path("this-tracker-does-not-exist.xlsx")
        keys = daily_scrape.tracker_keys(path)
        self.assertEqual(keys, set())


if __name__ == "__main__":
    unittest.main()
