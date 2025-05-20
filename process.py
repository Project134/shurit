# %% [markdown]
# ## importing libraries

# %%
import subprocess
import sys

def import_or_install(package):
    """Try to import a package; if not available, install it."""
    try:
        __import__(package)  # Try to import the package
    except ImportError:
        print(f"{package} not installed. Installing...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])
        print(f"{package} has been installed.")
    else:
        print(f"{package} is already installed.")



# %%
import_or_install('numpy')
import_or_install('selenium')
import_or_install('bs4')
import_or_install('requests')
import_or_install('lxml')


# %%
import os 
import numpy as np 
from bs4 import BeautifulSoup 
import requests
from selenium import webdriver 
import time
from selenium.webdriver.common.by import By 
import pandas as pd 
import random 
import json 
from collections import defaultdict
import ast
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# %% [markdown]
# ## functions

# %%
# manage json 
def write_json(data,fname,fpath=None):
    if fpath:
        loc = fpath + '/' + fname + '.json'
    else: 
        loc = os.getcwd()+"/" + fname + '.json'

    with open(loc, 'w') as json_file:
        json.dump(data, json_file)


def read_json(fname,fpath=None):
    if fpath:
        loc = fpath + '/' + fname + '.json'
    else: 
        loc = os.getcwd()+"/" + fname + '.json'

    try:
        with open(loc, 'r') as json_file:
            data = json.load(json_file)
            return data
    except FileNotFoundError:
        print(f"Error: The file {loc} does not exist.")
        return {}  # Return an empty dictionary

# %%
# this functions scrolls till the end of the page

def scroll(driver):
    last_height = driver.execute_script("window.scrollTo(0,100);")
    
    while True:
        last_height = driver.execute_script("return window.scrollY")
        time.sleep(1)
    
        driver.execute_script("window.scrollBy(0,window.scrollY);")
        new_height = driver.execute_script("return window.scrollY")
        # print(f'new height = {new_height} , last_height = {last_height}')
    
        if new_height == last_height:
            break


# %%
# this function collects data from the tiles and accumulates in the tiles list

def collect_data(driver,tile_class):
    html_content = driver.page_source
    soup = BeautifulSoup(html_content,'lxml')
    tile = soup.find_all('div',attrs={"class":tile_class})
    return tile


# %%
# random wait 

def wait():
    wait = random.randint(1,5)
    time.sleep(wait)


# %%
# finds the next button on naurki website and clicks it 

def click_next(driver,button_class):
    buttons = driver.find_elements(By.CLASS_NAME,button_class)

    if not buttons:
        return 'stop'

    next_button_found = 0
    for button in buttons:
        # print(button.text.lower())
        if 'next' in button.text.lower():
            next_button_found =1 

            is_disabled = button.get_attribute("disabled")
            if is_disabled:
                return 'stop'
            else:
                driver.execute_script("arguments[0].click()",button)

    if not next_button_found:
        return 'stop'

# %%
# convert text file to bs4 element

def file_to_list(file_path):
    with open(file_path, 'r') as file:
        # Read lines and strip newline characters
        lines = [line.strip() for line in file.readlines()]
    return lines

# %%
# extract element data and convert it into a dictionary through which the data will be extracted via keys 

def extract_tag_data_to_dict_and_df(ele):
    ele_data = defaultdict(list)

    current_ele = ele
    c = '0'
    while current_ele is not None:
        # Safely extract attributes and set defaults
        c = current_ele.get('class', c) if hasattr(current_ele, 'get') else c
        tag = current_ele.name if hasattr(current_ele, 'name') else '0'
        
        # Create the key tuple
        key = (str(c),str(tag), 'text')

        # Get the text, defaulting to empty string if None
        text = current_ele.text if current_ele.text is not None else ''
        
        # Append the text to the list for the corresponding key
        ele_data[key].append(text)

        # Move to the next element
        current_ele = current_ele.next_element

    # Remove duplicates from the lists 
    for k, v in ele_data.items():
        ele_data[k] = list(dict.fromkeys(v))

    # Create a string representation of the text lists, joined by '--'
    ele_data_str = {k: "--".join(str(item) for item in v if item) for k, v in ele_data.items()}
    
    # Convert the dictionary to a DataFrame
    ele_data_df = pd.DataFrame.from_dict(ele_data_str, orient='index', columns=['text'])

    return ele_data_str, ele_data_df

# %% [markdown]
# ## initialise parameters

# %%
# setting url
urls = read_json('n_urls')

# urls = {'one':'https://www.naukri.com/pyspark-jobs?k=pyspark&jobAge=7&experience=24'}

# current directory
cwd = os.getcwd()+"/"

# job1_name = input('Enter name for job_1')
# job1_password = input('Enter pwd for job_1')

# job2_name = input('Enter name for job_2')
# job2_password = input('Enter pwd for job_2')

# job1_name = ''
# job1_password = ''

# job2_name = ''
# job2_password = ''

# %% [markdown]
# ## open chrome and get jobs tiles from the url 

# %%
# function to login into naurki 

def login_naukri(name='',password=''):
    driver = webdriver.Chrome()
    url = 'https://www.naukri.com/'
    driver.get(url)

    if not name and not password:  
        time.sleep(10)
        print('continue without login')
        return driver
      
    login_button = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, 'login_Layer')))

    login_button.click()

    time.sleep(4)

    input_fields = driver.find_elements(By.TAG_NAME, 'input')

    if input_fields:
        input_fields[0].send_keys(name)
        input_fields[1].send_keys(password)

    time.sleep(1)

    submit_buttons = driver.find_elements(By.CLASS_NAME, 'loginButton')
    # driver.execute_script("arguments[0].click()",submit_button)
    submit_buttons[0].click()
    
    time.sleep(2)

    errors = driver.find_elements(By.CLASS_NAME, 'server-err')
    if len(errors) > 0:
        print('login --> failed')
    else:
        print('login --> success')

    time.sleep(10)
    return driver


# %% [markdown]
# ### get the data - job_1

# %%
def create_job_1():
    
    driver = login_naukri(job1_name,job1_password)

    tiles_db = {}


    for url_id, url in urls.items():
        driver.get(url)
        wait()
        state = 'start'    
        tiles = []
        while state!='stop':
            scroll(driver)
            wait()
            tile = collect_data(driver,tile_class='srp-jobtuple-wrapper')
            if tile:
                tiles = tiles + tile
            wait()
            state = click_next(driver,'styles_btn-secondary__2AsIP')
            
        t_count = 0
        for tile in tiles:        
            key = url_id+'--tile_'+str(t_count)
            tiles_db[key] = str(tile)
            t_count+=1

    driver.close()

    write_json(tiles_db,'job_1')

# %%
if os.path.exists(cwd+"job_1.json"):
    job_1_mtime = os.path.getmtime(cwd+"job_1.json")
    job_1_mdate = datetime.datetime.fromtimestamp(job_1_mtime).date()
    print(job_1_mdate)
    print(datetime.date.today())

    if not(job_1_mdate == datetime.date.today()):
        create_job_1()
else:
    create_job_1()
    


# %% [markdown]
# ### create df - job_1

# %%
# reading the job html file
job_1 = read_json('job_1')

#converting job elements tags
for tile_id, tile in job_1.items():
    job_1[tile_id] = BeautifulSoup(tile,'lxml').find('div')


# %%
df_job_1 = pd.DataFrame(columns=['job_id','company_name','job_title','job_url'])

for tile_id,tile in job_1.items():
    # extract the data from the tiles
    
    job_id = tile.get('data-job-id')
    title = tile.find('a',class_='title').text.strip()
    href = tile.find('a',class_='title')['href']
    company = tile.find('a',class_='comp-name').text.strip()

    # write the data in the dataframe

    data = {
        'job_id' : str(job_id),
        'company_name' : company,
        'job_title' : title,
        'job_url' : href
    }

    df_job_1.loc[len(df_job_1)] = data
  

# %%
# creating the a columns showcasing the duplicates in a dataframe

df_job_1['tile_duplicates'] = df_job_1.groupby(df_job_1.columns.tolist()).transform('size')
df_job_1 = df_job_1.drop_duplicates()

# %%
# df_job_1.to_excel(cwd+'job.xlsx',index=False)
df_job_1.to_csv(cwd+'job_1.csv',index=False)
print(f'total rows = {len(df_job_1)}')


# %% [markdown]
# ## open chrome and get additional information for each jobs

# %% [markdown]
# ### get the data - job_2

# %%
df_job_1 = pd.read_csv(cwd+'job_1.csv')
df_job_1['job_id'] = df_job_1['job_id'].astype(str)

# %%
driver = login_naukri(job2_name,job2_password) 

tiles = read_json('job_2')
count = 0
jobs_to_be_processed = len(job_1)

# for index,job_row in df_job_1.tail().iterrows():
for index,job_row in df_job_1.iterrows():
    job_id = str(job_row['job_id'])
    job_url = job_row['job_url']
    

    if job_id in tiles:
        print(f'{job_id} already in database')
        continue
    
    driver.get(job_url)
    wait()
    scroll(driver)
    wait()
    tile = collect_data(driver,tile_class='styles_left-section-container__btAcB')
    if tile:
        tiles[job_id] = str(tile[0])
    # tiles = tiles + [(job_id,tile[0])]
    wait()
    count+=1
    if count >=40:
        with open(cwd+'job_2.json', 'w') as json_file:
            json.dump(tiles, json_file)
        count = 0
        tiles = read_json('job_2')
        print(f'Percentage of files processed = {index/jobs_to_be_processed:.1%}')
    print(f'{index} out of {jobs_to_be_processed} (done)')    

driver.close()

# writing the tiles result in a file
with open(cwd+'job_2.json', 'w') as json_file:
    json.dump(tiles, json_file)

# %% [markdown]
# ### create df - job_2

# %%
# reading the job html file
with open(cwd + 'job_2.json', 'r') as json_file:
    job_2 = json.load(json_file)

# changing the types of elements(tile) corresponding to job id in json dictionary
for job_id,tile in job_2.items():
    job_2[job_id] = BeautifulSoup(tile,'lxml').find('div')


# %%
# # creating a dataframe to find_out columns keys
# tile = job_2['130225000057']
# dict_tile, df_tile = extract_tag_data_to_dict_and_df(tile)
# df_tile.to_csv(cwd+'df_tile.csv')
# dict_tile

# %%
# dictionary of columns_name and "keys to lookup in dictionary of tile" 

column_find_via = {
    # 'job_title': ("['styles_jhc__jd-top-head__MFoZl']", 'header', 'text'),
    # 'company_name':	("['styles_jd-header-comp-name__MvqAI']", 'a', 'text'),
    'company_rating' : 	("['styles_amb-rating__4UyFL']", 'span', 'text'),
    'job_experience' : 	("['styles_jhc__exp__k_giM']", 'div', 'text'),
    'job_location':	("['styles_jhc__loc___Du2H']", 'div', 'text'),
    'remote':("['styles_jhc__wfhmode-link__aHmrK']",'a','text'),
    'salary': ("['ni-icon-salary']", 'span', 'text'),
    'keywords':	("['styles_chip__7YCfG', 'styles_clickable__dUW8S']", 'span', 'text'),
    'keywords_2':("['styles_chip__7YCfG', 'styles_non-clickable__RM_KJ']", 'span', 'text'),
    'keywords_3':("['styles_chip__7YCfG', 'styles_clickable__dUW8S']",'a','text'),
    'apply_on_company_site': ("['styles_company-site-button__C_2YK', 'company-site-button']", 'button', 'text'),
    'easy_apply':("['styles_apply-button__uJI3A', 'apply-button']", 'button', 'text')
    
}

# %%
# creating a dataframe for job_2

df_job_2 = pd.DataFrame(columns=['job_id']+list(column_find_via.keys())+['keyskills_match'])

# populating dataframe for job_2

for job_id,tile in job_2.items():
    data = {
        'job_id':str(job_id)
    }
    
    dict_tile, df_tile = extract_tag_data_to_dict_and_df(tile)
    for col in column_find_via:
        data[col] = dict_tile.get(column_find_via[col])
    
    key_skills_match_div = ''
    for div in tile.find_all(attrs={'class':'styles_MS__details__iS7mj'}):
        if "keyskills" in div.get_text().lower():
            key_skills_match_div = div.find("i").get('class')[0]
    data['keyskills_match'] = key_skills_match_div

    df_job_2.loc[len(df_job_2)] = data

df_job_2 = df_job_1.merge(df_job_2,on='job_id',how='left')   

# df_job_2.to_excel(cwd+'job.xlsx',index=False)
df_job_2.to_csv(cwd+'job_2.csv',index=False)

# %%
# filtering jobs

df_job_3 = pd.read_csv(cwd+'job_2.csv')

## write filtering criteria here

df_job_3.to_csv(cwd+'job_3.csv',index=False)

# %% [markdown]
# ### modifying the job_data to

# %%
# read the dataframe

df_job_3 = pd.read_csv(cwd+'job_3.csv')


# %%
# keyword score

# keyword_terms = ['advanced analytics','manager','analyst','analytics','data','visualization','python','reporting','business intelligence','project management','product management','business analysis']

keyword_terms = [
    "SQL",
    "Python",
    "Analytics",
    "Business Analysis",
    "Data Visualization",
    "Reporting",
    "Insights",
    "Stakeholder Management",
    "Product Management",
    "Program Management",
    "Project Management",
    "Advanced Excel",
    "Data Governance",
    "Data Management",
    "Business Strategy",
    "strategy",
    "analyst",
    "data",
    "manager",
    "report",
    "agile"
]


def calculate_score(keywords):
    score = 0
    if pd.isna(keywords):
        return 0
    for k in keyword_terms:
        score += keywords.lower().count(k.lower())
    return score

df_job_3['keyword_score'] = df_job_3['keywords_3'].apply(calculate_score)+df_job_3['keywords'].apply(calculate_score) + 2*df_job_3['job_title'].apply(calculate_score) + df_job_3['keywords_2'].apply(calculate_score)


# %%

location_score_db = {
    'remote':1,
    'mumbai':2,
    'delhi':3,
    'noida':3,
    'gurugram':3,
    'gurgaon':3,
    'bangalore':4,
    'bengaluru':4,
    'pune':5,
    'hyderabad':6
}

def location_score(location):
    if pd.isna(location):
        return 10
    score=10
    for loc,score in location_score_db.items():
        if loc.lower() in location.lower():
            return score

    return score

df_job_3['location_score'] = df_job_3['job_location'].apply(location_score)


# %%
# sorting the dataframe

df_job_3 = df_job_3.sort_values(by=['keyword_score','company_rating','location_score','easy_apply','company_name'], ascending=[False,False, True,False,True])
df_job_3['display_text'] = df_job_3['keyword_score'].astype(str).str.cat(df_job_3['company_rating'].astype(str), sep=' | ',na_rep='NA').str.cat(df_job_3['salary'].astype(str), sep=' | ',na_rep = 'NA').str.cat(df_job_3['job_title'].astype(str), sep=' | ',na_rep = 'NA').str.cat(df_job_3['company_name'].astype(str), sep=' | ',na_rep = 'NA').str.cat(df_job_3['job_location'].astype(str),sep=' | ',na_rep = 'NA')


# %%
df_job_3.rename(columns={'job_url':'url',
                         'job_id':'id'},inplace=True)

# %%
df_job_3.columns

# %%
required_columns = ['id', 'url',
                    'company_name','company_rating',
                    'job_title','job_experience', 'salary',
                    'job_location', 'remote',
                    'keywords',
                    'apply_on_company_site','easy_apply',
                    'keyskills_match', 'keyword_score', 'location_score']

# %%
df_job_3 = df_job_3[required_columns]

# %%
def modify_column(df,condition,col_to_modify,previous_value,new_value):
    df = df.copy()
    if col_to_modify not in df.columns:
        df[col_to_modify] = previous_value

    filtered_df = df.query(f'{condition} and {col_to_modify}=="{previous_value}"')
    df.loc[filtered_df.index,col_to_modify]= new_value
    return df


# %%
## category assignment 

max_keyword_score = df_job_3['keyword_score'].max()

category_conditions = {
    'P1': "(location_score == 3) and (keyskills_match == 'ni-icon-check_circle') and (easy_apply == 'Apply')",
    'P2': "(location_score == 1) and (keyskills_match == 'ni-icon-check_circle') and (easy_apply == 'Apply')",
    'P1': "(keyword_score > @max_keyword_score - 10) and (easy_apply == 'Apply')"
    
}

# %%
for cat,condition in category_conditions.items():
    df_job_3 = modify_column(df_job_3,condition,'category','ZZZ',cat)

# %%
df_job_3.sort_values(by=['category'],inplace=True)

# %%
df_job_3.to_json('n.json',orient='records')

# %%



