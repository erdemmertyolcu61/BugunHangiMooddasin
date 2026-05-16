import os
import asyncio
from anthropic import AsyncAnthropic
from dotenv import load_dotenv

load_dotenv()

async def test_claude():
    client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    try:
        message = await client.messages.create(
            model=os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=10,
            messages=[{"role": "user", "content": "Hi"}]
        )
        print(f"Success: {message.content[0].text}")
    except Exception as e:
        print(f"Claude Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_claude())
