# Concert Price Predictor

Welcome to the Concert Price Predictor! This project is designed to help you predict ticket prices and resale margins for concerts using historical data, social media metrics, and machine learning techniques.

## What Can This Do?

This Concert Price Predictor provides a comprehensive toolkit for analyzing and predicting concert ticket prices:

### 1. **Multi-Source Data Collection**
- **Embrace Tracker** (`embrace_tracker.ipynb`): Scrape event details from Embrace using Selenium with reCAPTCHA solving capabilities
- **StubHub Tracker** (`stubhub_tracker.ipynb`): Extract ticket prices and availability from StubHub's secondary market
- **TicketWeb Tracker** (`ticketweb_tracker.ipynb`): Gather ticket tier and pricing information from TicketWeb
- **Social Media Tracker** (`socials_tracker.ipynb`): Collect artist popularity metrics from:
  - Spotify (followers, popularity score, monthly listeners)
  - Instagram (followers)
  - Twitter (followers)
  - StubHub (favorites count)

### 2. **Intelligent Data Processing**
- Clean and validate ticket price data
- Merge data from multiple sources (events, ticket platforms, social media)
- Filter by location (e.g., Toronto) and venue
- Calculate resale margins (Max Resell - Min Cost)
- Handle missing and invalid data automatically

### 3. **Predictive Analytics**
- **Linear Regression Models**: Predict ticket resale margins based on social media metrics
- **Random Forest Regressor**: Advanced ensemble learning for more accurate predictions
- **Feature Analysis**: Evaluate which factors most influence ticket prices:
  - Artist social media presence (Spotify, Instagram, Twitter)
  - Venue characteristics
  - Minimum ticket cost
  - Event date and location

### 4. **Database Management**
- SQLite database (`artist.db`) for storing and querying artist information
- Efficient data persistence and retrieval

## Key Features
- **Automated Web Scraping**: Uses Selenium with custom user-agent configurations and anti-detection measures
- **Multi-Platform Support**: Aggregates data from 4+ ticket and social media platforms
- **Machine Learning Predictions**: Train models to predict ticket resale margins
- **Data Analysis**: Understand which artists and venues generate higher resale values
- **Real-Time Data**: Capable of scraping current ticket prices and social metrics

## Technologies and Libraries Used

- **Programming Language**: Python 3.x
- **Web Scraping**: 
  - Selenium WebDriver (with Chrome)
  - BeautifulSoup4
  - Scrapy
  - selenium-recaptcha (for CAPTCHA solving)
  - googlesearch-python
- **Data Processing**: Pandas, NumPy
- **Machine Learning**: Scikit-learn, TensorFlow, Keras
- **Visualization**: Matplotlib, Seaborn
- **Database**: SQLite
- **Development Environment**: Jupyter Notebook

## Machine Learning Techniques

- **Linear Regression**: Baseline model for predicting resale margins
- **Random Forest Regressor**: Ensemble model for improved accuracy
- **Feature Engineering**: Social media metrics, venue data, and pricing history
- **Model Evaluation**: Cross-validation and performance metrics to assess predictions

## Requirements

- Python 3.x
- Jupyter Notebook
- Required Python libraries (listed in `requirements.txt`)

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/evoong/Concert-Price-Predictor.git
    ```
2. Navigate to the project directory:
    ```sh
    cd Concert-Price-Predictor
    ```
3. Install the required libraries:
    ```sh
    pip install -r requirements.txt
    ```

## Usage

### Main Analysis Notebook

1. Open Jupyter Notebook:
    ```sh
    jupyter notebook
    ```
2. Open the `Concert_Price_Predictor.ipynb` notebook
3. Ensure you have your ticket sales data in Excel format with sheets: Events, Embrace, TicketWeb, Socials
4. Update the file path in the notebook to point to your data file
5. Run all cells to:
   - Load and clean data from multiple sources
   - Merge datasets based on artist names
   - Filter data by location and venue
   - Train machine learning models
   - Generate predictions for ticket resale margins

### Data Collection Notebooks

#### Embrace Tracker
```sh
# Open embrace_tracker.ipynb
jupyter notebook embrace_tracker.ipynb
```
- Scrapes event details from Embrace
- Handles reCAPTCHA challenges automatically
- Extracts venue, date, and pricing information

#### StubHub Tracker
```sh
# Open stubhub_tracker.ipynb
jupyter notebook stubhub_tracker.ipynb
```
- Logs into StubHub and searches for specific artists
- Extracts current ticket prices and availability
- Saves data to Excel for analysis

#### TicketWeb Tracker
```sh
# Open ticketweb_tracker.ipynb
jupyter notebook ticketweb_tracker.ipynb
```
- Searches for artists on TicketWeb
- Extracts ticket tiers and pricing
- Aggregates data for upcoming events

#### Social Media Tracker
```sh
# Open socials_tracker.ipynb
jupyter notebook socials_tracker.ipynb
```
- Collects artist metrics from Spotify, Instagram, and Twitter
- Uses Google search and web scraping to find artist profiles
- Stores social media data for correlation with ticket prices

### SQLite Database
Use `sqlite.ipynb` to interact with the artist database for storing and querying artist information.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

This project demonstrates the power of combining web scraping, social media analytics, and machine learning to understand and predict concert ticket pricing dynamics in the secondary market.