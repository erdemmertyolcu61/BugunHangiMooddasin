"""
OMDb Service - Fetches aggregated ratings (IMDb, Rotten Tomatoes, Metacritic).
"""
import httpx
from backend.config import OMDB_API_KEY, OMDB_BASE_URL


class OMDbService:
    def __init__(self):
        self.api_key = OMDB_API_KEY
        self.base_url = OMDB_BASE_URL

    async def get_ratings(self, title: str, year: str = None) -> dict:
        """Fetch IMDb, Rotten Tomatoes, and Metacritic ratings for a movie."""
        params = {
            "apikey": self.api_key,
            "t": title,
            "type": "movie",
        }
        if year:
            params["y"] = year

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()

                if data.get("Response") == "False":
                    return self._empty_ratings()

                ratings = []
                imdb_rating = data.get("imdbRating")
                rotten_tomatoes = None
                metacritic = data.get("Metascore")

                for rating in data.get("Ratings", []):
                    ratings.append({
                        "source": rating["Source"],
                        "value": rating["Value"],
                    })
                    if rating["Source"] == "Rotten Tomatoes":
                        rotten_tomatoes = rating["Value"]

                imdb_votes_raw = data.get("imdbVotes", "0")
                # Normalize "123,456" -> 123456
                try:
                    imdb_votes = int(imdb_votes_raw.replace(",", ""))
                except (ValueError, AttributeError):
                    imdb_votes = 0

                return {
                    "ratings": ratings,
                    "imdb_id": data.get("imdbID"),
                    "imdb_rating": imdb_rating if imdb_rating != "N/A" else None,
                    "imdb_votes": imdb_votes,
                    "rotten_tomatoes": rotten_tomatoes,
                    "metacritic": metacritic if metacritic != "N/A" else None,
                    "awards": data.get("Awards"),
                    "director": data.get("Director"),
                }
        except Exception as e:
            print(f"OMDb error for '{title}': {e}")
            return self._empty_ratings()

    @staticmethod
    def _empty_ratings() -> dict:
        return {
            "ratings": [],
            "imdb_id": None,
            "imdb_rating": None,
            "imdb_votes": 0,
            "rotten_tomatoes": None,
            "metacritic": None,
            "awards": None,
            "director": None,
        }


omdb_service = OMDbService()
