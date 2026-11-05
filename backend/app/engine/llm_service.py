import hashlib
import logging
import random
import threading
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

# Tried in order. Each free-tier model has its own quota and its own load,
# so when one is busy or exhausted the next one usually still works.
# Override without code changes: GEMINI_MODELS=model-a,model-b in backend/.env
DEFAULT_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.0-flash",
)
ATTEMPTS_PER_MODEL = 2          # for temporary 5xx errors only
BASE_DELAY_SECONDS = 1.5
REQUEST_TIMEOUT_MS = 20_000
SERVER_RETRY_CODES = {500, 502, 503, 504}   # "unavailable / high demand": retry, then next model
NEXT_MODEL_CODES = {404, 429}               # model missing / quota hit: go straight to next model

CACHE_TTL_SECONDS = 600
CACHE_MAX_ITEMS = 128
_cache: dict[str, tuple[float, str]] = {}
_cache_lock = threading.Lock()

LOCAL_PROVIDER = "local-intelligence-engine"
_state = threading.local()


def get_last_provider() -> str:
    """Which engine produced the most recent answer in this request thread."""
    return getattr(_state, "provider", LOCAL_PROVIDER)


def _set_provider(value: str) -> None:
    _state.provider = value


def _models() -> list[str]:
    raw = getattr(settings, "GEMINI_MODELS", "") or ""
    custom = [m.strip() for m in raw.split(",") if m.strip()]
    return custom or list(DEFAULT_MODELS)


def _cache_get(key: str) -> str | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < CACHE_TTL_SECONDS:
            return hit[1]
        _cache.pop(key, None)
    return None


def _cache_put(key: str, value: str) -> None:
    with _cache_lock:
        if len(_cache) >= CACHE_MAX_ITEMS:
            _cache.pop(min(_cache, key=lambda k: _cache[k][0]), None)
        _cache[key] = (time.time(), value)


def generate_ai_response(prompt: str) -> str:
    """Generate a response with Gemini, retrying busy errors and falling back across models."""
    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty.")

    api_key = settings.LLM_API_KEY
    if not api_key or not api_key.strip():
        raise RuntimeError("Gemini API key is not configured.")

    prompt = prompt.strip()
    cache_key = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    cached = _cache_get(cache_key)
    if cached:
        _set_provider("gemini")
        return cached

    from google import genai
    from google.genai import errors, types

    client = genai.Client(
        api_key=api_key.strip(),
        http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
    )

    last_error: Exception | None = None
    for model in _models():
        for attempt in range(1, ATTEMPTS_PER_MODEL + 1):
            try:
                response = client.models.generate_content(model=model, contents=prompt)
                answer = (response.text or "").strip()
                if not answer:
                    raise RuntimeError("Gemini returned an empty response.")
                _cache_put(cache_key, answer)
                _set_provider("gemini")
                logger.info("Gemini answered using %s (attempt %s).", model, attempt)
                return answer

            except errors.APIError as exc:
                last_error = exc
                code = getattr(exc, "code", None)
                if code in SERVER_RETRY_CODES and attempt < ATTEMPTS_PER_MODEL:
                    delay = BASE_DELAY_SECONDS * (2 ** (attempt - 1)) + random.uniform(0, 0.75)
                    logger.warning("%s busy (HTTP %s). Retry %s/%s in %.1fs.", model, code, attempt, ATTEMPTS_PER_MODEL, delay)
                    time.sleep(delay)
                    continue
                if code in SERVER_RETRY_CODES or code in NEXT_MODEL_CODES:
                    logger.warning("%s unavailable (HTTP %s). Trying next model.", model, code)
                    break
                # Bad key, permission or malformed request: other models will fail the same way.
                logger.error("Gemini request rejected (HTTP %s): %s", code, exc)
                raise

            except RuntimeError as exc:  # empty response -> try next model
                last_error = exc
                logger.warning("%s returned an empty response. Trying next model.", model)
                break

            except Exception as exc:  # network / timeout -> try next model
                last_error = exc
                logger.warning("%s request failed (%s). Trying next model.", model, type(exc).__name__)
                break

    raise RuntimeError("All Gemini models are currently busy or unavailable.") from last_error


def _generate_deterministic_explanation(summary: dict) -> str:
    """High-quality deterministic architectural narrative when Gemini API key is absent."""
    health = summary.get("health_index", 100)
    total_files = summary.get("total_files", 0)
    total_commits = summary.get("total_commits", 0)
    high_risk_files = summary.get("high_risk_files", 0)
    top_risky = summary.get("top_risky_files", [])
    violations = summary.get("architecture_violations", [])
    cycles = summary.get("cycles", [])

    health_status = "robust" if health >= 85 else "moderate" if health >= 70 else "concerning"

    sections = [
        f"### Executive Health Summary\n"
        f"The repository exhibits a **{health_status} architectural health index of {health:.1f}/100** "
        f"across {total_files} analyzed files and {total_commits} historical commits. "
        f"A total of {high_risk_files} file(s) currently exceed the high-risk threshold."
    ]

    if top_risky:
        risky_lines = [f"- **`{item.get('path', 'unknown')}`** (Risk Score: {item.get('risk_score', 0):.2f})" for item in top_risky[:4]]
        sections.append(
            "### Hotspot & Risk Analysis\n"
            "The following modules concentrate the highest technical risk due to elevated cyclomatic complexity, "
            "frequent churn, or dependency centrality:\n" + "\n".join(risky_lines) +
            "\n\n*Recommendation*: Prioritize unit test coverage and modular decomposition for these central modules."
        )

    if violations:
        violation_lines = [f"- {v}" for v in violations[:3]]
        sections.append(
            "### Architectural Boundary Compliance\n"
            f"Detected **{len(violations)} architectural drift violation(s)** that compromise intended layer boundaries:\n"
            + "\n".join(violation_lines) +
            "\n\n*Recommendation*: Decouple inverted dependencies using interface abstractions or dependency injection."
        )
    else:
        sections.append(
            "### Architectural Boundary Compliance\n"
            "No cross-layer architectural rule violations were detected. Layer boundaries are currently respected."
        )

    if cycles:
        sections.append(
            f"### Circular Dependency Warnings\n"
            f"Identified {len(cycles)} circular dependency loop(s). Circular relationships increase cognitive load "
            f"and impede modular refactoring. Extract shared interfaces or utility layers to break cycles."
        )

    sections.append(
        "### Actionable Engineering Directives\n"
        "1. **Stabilize Core Hotspots**: Refactor high-centrality files to minimize ripple effects of upcoming changes.\n"
        "2. **Continuous Impact Verification**: Run change-impact predictions before merging pull requests affecting core packages.\n"
        "3. **Enforce Layer Isolation**: Maintain strict import boundaries to prevent architectural erosion."
    )

    return "\n\n".join(sections)


def generate_structured_repo_explanation(summary: dict, *, max_items: int = 5) -> str | None:
    """Generate an advisory explanation from a bounded structured summary."""
    if not summary:
        return None

    _set_provider(LOCAL_PROVIDER)
    api_key = settings.LLM_API_KEY
    if not api_key or not api_key.strip():
        return _generate_deterministic_explanation(summary)

    top_risky = summary.get("top_risky_files", [])[:max_items]
    violation_text = summary.get("architecture_violations", [])
    impact_text = summary.get("impact", [])
    lines = [
        "You are an expert Software Intelligence Platform AI Assistant for code review and architecture analysis.",
        "Synthesize a professional, concise executive report and technical recommendations based solely on these structured facts:",
        f"- Health Index: {summary.get('health_index', 'n/a')}/100",
        f"- Total Files: {summary.get('total_files', 'n/a')}",
        f"- Total Commits: {summary.get('total_commits', 'n/a')}",
        f"- High Risk Files: {summary.get('high_risk_files', 'n/a')}",
        "Top risky files:",
    ]
    if top_risky:
        lines.extend(f"  * {item.get('path', 'unknown')}: score={item.get('risk_score', 0)}" for item in top_risky)
    else:
        lines.append("  * None above high-risk threshold")

    lines.append("Architecture violations:")
    if violation_text:
        lines.extend(f"  * {item}" for item in violation_text[:max_items])
    else:
        lines.append("  * None")

    lines.append("Impact findings:")
    if impact_text:
        lines.extend(f"  * {item}" for item in impact_text[:max_items])
    else:
        lines.append("  * None")

    try:
        return generate_ai_response("\n".join(lines))
    except Exception:
        logger.exception("Gemini explanation failed, falling back to deterministic explanation.")
        return _generate_deterministic_explanation(summary)


def answer_repository_question(summary: dict, question: str) -> str:
    """Answer questions from developers and architects about repository metrics, architecture, and risk."""
    q_lower = question.lower().strip()
    api_key = settings.LLM_API_KEY
    _set_provider(LOCAL_PROVIDER)

    if api_key and api_key.strip():
        system_context = (
            f"You are the Software Intelligence Platform (SIP) AI Assistant. "
            f"Repository context: Health Index={summary.get('health_index', 'N/A')}/100, "
            f"Files={summary.get('total_files', 0)}, Commits={summary.get('total_commits', 0)}, "
            f"High Risk Files={summary.get('high_risk_files', 0)}, "
            f"Top Risky Files={[f['path'] for f in summary.get('top_risky_files', [])[:5]]}, "
            f"Architecture Violations={summary.get('architecture_violations', [])}, "
            f"Cycles={len(summary.get('cycles', []))}. "
            f"Answer the user question concisely, accurately, and with actionable engineering suggestions:"
        )
        try:
            return generate_ai_response(f"{system_context}\n\nQuestion: {question}")
        except Exception as e:
            logger.warning("Gemini failed for question, falling back to heuristic assistant: %s", e)

    # Deterministic heuristics assistant
    health = summary.get("health_index", 100)
    top_risky = summary.get("top_risky_files", [])
    violations = summary.get("architecture_violations", [])
    cycles = summary.get("cycles", [])

    if any(k in q_lower for k in ["risk", "hotspot", "critical", "churn", "complex"]):
        if top_risky:
            files_desc = "\n".join(f"- **`{f.get('path')}`** (Risk Score: {f.get('risk_score', 0):.2f})" for f in top_risky[:5])
            return (
                f"### Highest-Risk Modules Identified\n\n"
                f"Based on cyclomatic complexity, commit frequency (churn), and network centrality, "
                f"the most critical files in this repository are:\n\n{files_desc}\n\n"
                f"**Recommendation**: These files have high blast radius. Introduce automated regression tests before altering them."
            )
        return "No files currently exceed the critical risk threshold. Code churn and complexity are well-balanced."

    if any(k in q_lower for k in ["drift", "violation", "architecture", "boundary", "layer"]):
        if violations:
            v_desc = "\n".join(f"- {v}" for v in violations)
            return (
                f"### Architecture Drift & Layer Violations\n\n"
                f"The platform detected {len(violations)} architectural boundary violation(s):\n\n{v_desc}\n\n"
                f"**Remediation**: Invert the dependency or introduce a service abstraction so upper layers do not tightly couple to implementation details."
            )
        return "Great news: Zero architectural drift violations detected. All file dependencies follow established layer guidelines."

    if any(k in q_lower for k in ["cycle", "circular", "loop"]):
        if cycles:
            return (
                f"### Circular Dependency Analysis\n\n"
                f"There are **{len(cycles)} circular dependency loops** in the codebase. "
                f"Circular dependencies prevent clean packaging, increase compilation/import coupling, and make testing in isolation difficult.\n\n"
                f"**Fix**: Extract shared types or utility functions into a separate base module."
            )
        return "No circular dependency cycles were found. The module dependency graph is a clean Directed Acyclic Graph (DAG)."

    if any(k in q_lower for k in ["health", "score", "overview", "summary", "status"]):
        return (
            f"### Repository Health Overview\n\n"
            f"- **Overall Health Index**: {health:.1f} / 100\n"
            f"- **Total Files Analyzed**: {summary.get('total_files', 0)}\n"
            f"- **Total Git Commits**: {summary.get('total_commits', 0)}\n"
            f"- **High-Risk Hotspots**: {summary.get('high_risk_files', 0)}\n"
            f"- **Circular Cycles**: {len(cycles)}\n"
            f"- **Architecture Violations**: {len(violations)}"
        )

    # General engineering query
    return (
        f"### Software Intelligence Insights for your Query\n\n"
        f"You asked: *\"{question}\"*\n\n"
        f"Current Repository Health is **{health:.1f}/100** with {len(top_risky)} high-risk files and {len(violations)} architecture violations. "
        f"To improve the software architecture, review files in the **Risk Analysis** tab and verify downstream impact before making refactoring changes."
    )